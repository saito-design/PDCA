"""
店舗管理表から坪数・席数・家賃を取得してjunestory_stores.jsonを更新
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from io import BytesIO

sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import setup_google_auth, get_drive_service

# 店舗管理表のファイルID
STORE_MANAGEMENT_FILE_ID = '1o8mLajjm8FOKVeJc2a-qaGNBMRCF0NDu'


def download_excel(service, file_id):
    """Google DriveからExcelファイルをダウンロード"""
    request = service.files().get_media(fileId=file_id)
    content = request.execute()
    return BytesIO(content)


def parse_store_management(excel_data):
    """店舗管理表をパースして店舗情報を抽出"""
    import openpyxl

    wb = openpyxl.load_workbook(excel_data, data_only=True)
    ws = wb['店舗一覧']

    stores = []
    current_category = None
    current_brand = None

    for row in ws.iter_rows(min_row=1, max_row=70, values_only=True):
        if not row or all(cell is None for cell in row):
            continue

        cell1 = str(row[1] or '').strip() if row[1] else ''
        cell2 = row[2]

        # セクションヘッダーを検出
        if '直営店店舗（' in cell1 or '直営（' in cell1:
            current_category = '直営'
            # 括弧内の業態名を抽出
            import re
            match = re.search(r'[（(]([^）)]+)[）)]', cell1)
            if match:
                current_brand = match.group(1)
            continue

        if cell1 == 'FC店舗':
            current_category = 'FC'
            current_brand = None
            continue

        if cell1 == '業務委託':
            current_category = '業務委託'
            current_brand = None
            continue

        if cell1 == '店舗数':
            continue

        # 店舗データ行
        if cell2 and current_category:
            store_name = str(cell2).strip()
            if not store_name:
                continue

            # 本厚木店は閉店のため除外
            if store_name == '本厚木店':
                continue

            # 業態を決定
            brand = current_brand
            if not brand:
                if '均タロー' in store_name:
                    brand = '均タロー'
                elif 'きんたろう' in store_name:
                    brand = 'きんたろう'
                elif '鶏ヤロー' in store_name:
                    brand = '鶏ヤロー'
                elif '魚ゑもん' in store_name:
                    brand = '魚ゑもん'
                elif '豚ギャング' in store_name:
                    brand = '豚ギャング'
                else:
                    brand = '不明'

            # 坪数、席数、家賃を取得
            tsubo = row[8] if len(row) > 8 and row[8] else None
            seats = row[9] if len(row) > 9 and row[9] else None
            rent = row[10] if len(row) > 10 and row[10] else None

            # 数値変換
            if tsubo is not None:
                try:
                    tsubo = float(tsubo)
                except (ValueError, TypeError):
                    tsubo = None

            if seats is not None:
                try:
                    seats = int(seats)
                except (ValueError, TypeError):
                    seats = None

            if rent is not None:
                try:
                    rent = int(rent)
                except (ValueError, TypeError):
                    rent = None

            stores.append({
                'category': current_category,
                'brand': brand,
                'store_name': store_name,
                'tsubo': tsubo,
                'seats': seats,
                'rent': rent,
            })

    return stores


def match_store(pos_name, master_stores):
    """POS店舗名からマスタ店舗をマッチング"""
    import re

    # 吉祥寺店は「きんたろう」にマッチ
    if '吉祥寺' in pos_name:
        for s in master_stores:
            if s['brand'] == 'きんたろう' and s['store_name'] == '吉祥寺店':
                return s

    # 業態と店名を分離
    match = re.match(r'^(均タロー|きんたろう|鶏ヤロー|魚ゑもん|豚ギャング)[!！\s]?(.+)$', pos_name)
    if match:
        pos_brand = match.group(1)
        pos_store_name = match.group(2).strip()

        for s in master_stores:
            if s['brand'] == pos_brand:
                if (s['store_name'] == pos_store_name or
                    s['store_name'] in pos_store_name or
                    pos_store_name in s['store_name']):
                    return s

    # 業態なしの場合
    for s in master_stores:
        if s['store_name'] in pos_name or pos_name in s['store_name']:
            return s

    return None


def update_junestory_stores(master_stores):
    """junestory_stores.jsonを更新"""
    script_dir = Path(__file__).parent
    stores_file = script_dir / 'junestory_stores.json'

    with open(stores_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated_count = 0

    for store in data['stores']:
        pos_name = store['name']
        matched = match_store(pos_name, master_stores)

        if matched:
            store['tsubo'] = matched['tsubo']
            store['seats'] = matched['seats']
            store['rent'] = matched['rent']
            store['category'] = matched['category']
            updated_count += 1
            print(f"  OK {pos_name} -> tsubo:{matched['tsubo']}, seats:{matched['seats']}, rent:{matched['rent']}")
        else:
            store['tsubo'] = None
            store['seats'] = None
            store['rent'] = None
            store['category'] = None
            print(f"  NG {pos_name} -> no match")

    # 更新日時を追加（JST）
    from zoneinfo import ZoneInfo
    jst = ZoneInfo('Asia/Tokyo')
    now_jst = datetime.now(jst)
    data['generated_at'] = now_jst.strftime('%Y-%m-%d')
    data['store_master_updated_at'] = now_jst.isoformat()

    # 保存
    with open(stores_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return updated_count


def main():
    print("========== 店舗マスタ更新開始 ==========\n")

    # 環境設定
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    env_path = project_dir / '.env.local'

    if env_path.exists():
        setup_google_auth(str(env_path))

    # Google Drive APIサービス取得
    service = get_drive_service()
    if not service:
        print("[ERROR] Google Drive APIが利用できません")
        return

    # 店舗管理表をダウンロード
    print("1. 店舗管理表をダウンロード中...")
    try:
        excel_data = download_excel(service, STORE_MANAGEMENT_FILE_ID)
        print("   ダウンロード完了")
    except Exception as e:
        print(f"   [ERROR] ダウンロード失敗: {e}")
        return

    # パース
    print("\n2. 店舗管理表をパース中...")
    master_stores = parse_store_management(excel_data)
    print(f"   {len(master_stores)}店舗を抽出")

    # junestory_stores.json更新
    print("\n3. junestory_stores.jsonを更新中...")
    updated_count = update_junestory_stores(master_stores)
    print(f"\n   {updated_count}店舗を更新")

    print("\n========== 完了 ==========")


if __name__ == '__main__':
    main()
