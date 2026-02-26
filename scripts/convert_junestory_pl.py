"""
ジュネストリー損益データを縦持ち形式に変換するスクリプト

入力: TKC部門別損益比較表PDF → CSV（既存スクリプトで変換済み）
出力: pl_data.json（縦持ち形式）

出力形式:
年月, 店舗コード, 店舗名, 大項目, 中項目, 単位, 区分, 値
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import json
import os
import re
import glob

from convert_lib import (
    setup_google_auth,
    get_drive_service,
    upload_to_drive,
    load_junestory_master
)


# 店舗マスタ（Google Driveから読み込み、グローバルにキャッシュ）
_STORE_MASTER = None


def get_store_master():
    """店舗マスタを取得（キャッシュ付き）"""
    global _STORE_MASTER
    if _STORE_MASTER is None:
        _STORE_MASTER = load_junestory_master()
    return _STORE_MASTER


def get_store_info_from_pl_name(pl_name: str) -> tuple:
    """PL店舗名から店舗コードと正式名称を取得

    Args:
        pl_name: PL上の店舗名（例: "鶏ヤロー蒲田", "均タロー大宮"）

    Returns:
        (store_code, store_name) or (None, None)
    """
    master = get_store_master()
    if not master:
        return None, None

    pl_mapping = master.get('mapping', {}).get('pl', {})
    stores = master.get('stores', {})

    # PLマッピングで検索（完全一致優先）
    if pl_name in pl_mapping:
        store_code = pl_mapping[pl_name]
        if store_code in stores:
            return store_code, stores[store_code]['name']

    # 部分一致で検索
    for mapped_pl_name, store_code in pl_mapping.items():
        if mapped_pl_name in pl_name or pl_name in mapped_pl_name:
            if store_code in stores:
                return store_code, stores[store_code]['name']

    return None, None


# TKC部門コード→正式店番マッピング（完全版）
# store_code_mapping.csvのPOSコードとは異なるので注意
TKC_STORE_MAPPING_FALLBACK = {
    # グループ・共通（そのまま）
    '000': ('0000', '共通部門'),
    '500': ('0500', '飲食'),
    '700': ('0700', '鶏ヤローグループ'),
    '800': ('0800', '均タローグループ'),
    '810': ('0810', '魚衛門グループ'),
    '900': ('0900', 'フランチャイズ'),
    '998': ('0998', '閉鎖部門'),
    # 鶏ヤロー (2301-2305)
    '002': ('2301', '鶏ヤロー蒲田店'),
    '005': ('2302', '鶏ヤロー平間店'),  # 閉店
    '007': ('2303', '鶏ヤロー下北沢店'),
    '009': ('2304', '鶏ヤロー横浜店'),
    '018': ('2305', '鶏ヤロー歌舞伎町2号店'),
    # 均タロー (1102-1113)
    '011': ('1102', '均タロー大宮店'),
    '012': ('1103', '均タロー高田馬場店'),
    '014': ('1104', '均タロー溝の口店'),
    '017': ('1106', '均タロー渋谷店'),
    '019': ('1107', '均タロー川越店'),
    '020': ('1108', '均タロー橋本店'),
    '022': ('1109', '均タロー吉祥寺店'),
    '021': ('1110', '均タロー横浜店'),
    '024': ('1111', '均タロー蒲田店'),
    '026': ('1112', '均タロー平塚店'),
    '027': ('1113', '均タロー浜松店'),
    # 閉店・FC・業務委託
    '008': ('1114', '均タロー下北沢店'),  # 業務委託
    '013': ('1115', '均タロー西葛西店'),  # 閉店
    '015': ('1116', '均タロー上野店'),    # FC
    '016': ('1117', '均タロー水道橋店'),  # FC
    '101': ('1118', '均タロー神保町店'),  # FC
    '102': ('1119', '均タロー大和店'),    # FC
    '103': ('1120', '均タローすすきの店'),# FC
    # きんたろう (3101-3102)
    '006': ('3102', 'きんたろう練馬店'),
    '023': ('3101', 'きんたろう本厚木店'),
    # 魚ゑもん (4101-4103)
    '025': ('4101', '魚ゑもん柏店'),
    '031': ('4102', '魚ゑもん新橋店'),
    '029': ('4103', '魚ゑもん大井町店'),
    # その他
    '010': ('9010', 'クローバー'),
    '028': ('9028', '店舗A'),
    '030': ('9030', '店舗C'),
}

# 勘定科目の大項目分類（損益計算書の順序 - PDFに基づく）
# 注意: キーワードの順序が重要（より具体的なものを先に判定）
ACCOUNT_CATEGORIES = {
    '売上高': [
        '現金売上高', 'クレジット売上高', 'ポイント売上高', '電子マネー売上', '商品券売上高',
        '飲食店売上高合計', 'クローバー売上高', 'フランチャイズ料', '純売上高', '売上総合計'
    ],
    '売上原価': [
        '期首棚卸高', '商品仕入高', '備品・厨房資材', '飲食店原価合計',
        '仕入値引戻し高', '他勘定振替高', '期末棚卸高', '当期売上原価'
    ],
    '売上総利益': ['売上総利益'],
    '販管費': [
        # 人件費
        '役員報酬', '給与手当', '残業手当', '店舗応援費', 'アルバイト給与', '従業員賞与',
        '直接人件費合計', '法定福利費', '厚生費', '社宅家賃', '間接人件費合計', '人件費合計',
        # 移動費
        '旅費交通費', '車両費', '燃料費', '移動費合計',
        # 設備費
        'リース料', '賃借料', '店内サービス費', '備品消耗品費', '事務用消耗品費',
        '少額減価償却資産', '水道光熱費', '通信費', '店舗家賃', '修繕費', '店舗開発費',
        '減価償却費', '設備費合計',
        # 交際費
        '接待交際費', '会議費', '諸会費', '寄付金', '交際関連費合計',
        # 経営戦略
        '広告宣伝費', '求人費', '図書研究費', '支払手数料', 'クレジットカード等手数料',
        '損害保険料', '生命保険料', '管理諸費', '調査研究費', '経営戦略経費合計',
        # その他
        '租税公課', '貸倒引当金繰入', '雑費', 'その他合計',
        '販売費及び一般管理費'
    ],
    '営業利益': ['営業利益', '営業利益(損失)'],
    '営業外': [
        '受取利息', '貸倒引当金戻入益', '受取配当金', '雑収入', '営業外収益計',
        '支払利息', '手形売却損', '本社配賦固定費', '貸倒償却', '繰延資産償却', '雑損失', '営業外費用計'
    ],
    '経常利益': ['経常利益', '経常利益(損失)', '共通原価配賦', '共通固定費配賦', '配賦後経常利益'],
}


def categorize_account(account_name: str) -> str:
    """勘定科目を大項目に分類

    判定順序が重要:
    1. 完全一致を優先
    2. より具体的なキーワード（長いもの）を優先
    3. 部分一致
    """
    account_name = account_name.strip()

    # 完全一致を最優先
    for category, keywords in ACCOUNT_CATEGORIES.items():
        for keyword in keywords:
            if account_name == keyword:
                return category

    # 長いキーワードから順にマッチ（より具体的なマッチを優先）
    all_matches = []
    for category, keywords in ACCOUNT_CATEGORIES.items():
        for keyword in keywords:
            if keyword in account_name:
                all_matches.append((len(keyword), category, keyword))

    if all_matches:
        # 最も長いキーワードにマッチしたカテゴリを返す
        all_matches.sort(reverse=True)
        return all_matches[0][1]

    return 'その他'


def parse_numeric_value(value) -> float:
    """数値をパース（カンマ区切り、括弧負数対応）"""
    if pd.isna(value) or value == '' or value is None:
        return None

    s = str(value).strip()

    # 空や非数値
    if not s or s in ['-', '－', '―', '−', '*', '***']:
        return None

    # 括弧で囲まれた数値は負数
    is_negative = False
    if s.startswith('(') and s.endswith(')'):
        is_negative = True
        s = s[1:-1]
    elif s.startswith('△') or s.startswith('▲'):
        is_negative = True
        s = s[1:]

    # カンマを除去
    s = s.replace(',', '')

    try:
        val = float(s)
        return -val if is_negative else val
    except ValueError:
        return None


def extract_yearmonth_from_filename(filename: str) -> str:
    """ファイル名から年月を抽出"""
    # パターン: 2025年12月, 2025年11月 等
    match = re.search(r'(\d{4})年(\d{1,2})月', filename)
    if match:
        year, month = match.groups()
        return f"{year}-{int(month):02d}"

    # パターン: YYYYMM
    match = re.search(r'(\d{4})(\d{2})', filename)
    if match:
        year, month = match.groups()
        return f"{year}-{month}"

    return None


def load_store_map_auto(pl_folder: Path) -> dict:
    """store_map_auto.jsonを読み込む"""
    # 損益元データフォルダにある場合を優先
    auto_path = pl_folder / '損益元データ' / 'store_map_auto.json'
    if not auto_path.exists():
        auto_path = pl_folder / 'store_map_auto.json'
    if auto_path.exists():
        with open(auto_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def convert_pl_csv(csv_path: Path, yearmonth: str, store_map_auto: dict) -> list:
    """損益CSVを縦持ち形式に変換"""
    records = []

    try:
        # cp932（Shift-JIS）で読み込み
        df = pd.read_csv(csv_path, encoding='cp932', header=0)
    except:
        try:
            df = pd.read_csv(csv_path, encoding='utf-8-sig', header=0)
        except Exception as e:
            print(f"  [ERROR] CSV読み込み失敗: {csv_path.name} - {e}")
            return []

    if len(df) == 0:
        return []

    # カラム名を取得
    columns = df.columns.tolist()

    # 勘定科目名と科目コードのカラムを特定
    account_col = None
    code_col = None

    for col in columns:
        col_str = str(col).strip()
        if '勘定科目' in col_str or '科目名' in col_str:
            account_col = col
        if '科目コード' in col_str or 'コード' in col_str:
            code_col = col

    if not account_col:
        # 最初のカラムを勘定科目と仮定
        account_col = columns[0]

    # 店舗カラムを特定（(XXX)形式のカラム名）
    master = get_store_master()
    stores = master.get('stores', {}) if master else {}
    pl_mapping = master.get('mapping', {}).get('pl', {}) if master else {}

    store_columns = []
    for col in columns:
        col_str = str(col).strip()
        match = re.search(r'\((\d{3})\)', col_str)
        if match:
            dept_code = match.group(1)

            # カラム名からPL店舗名を抽出（例: "鶏ヤロー蒲田(002)" → "鶏ヤロー蒲田"）
            pl_name_match = re.match(r'^(.+?)\s*\(\d{3}\)', col_str)
            pl_name = pl_name_match.group(1).strip() if pl_name_match else None

            store_code, store_name = None, None

            # 1. 固定マッピング（TKC部門コード→正式店番）を最優先
            fallback = TKC_STORE_MAPPING_FALLBACK.get(dept_code)
            if fallback:
                store_code, store_name = fallback
                # マスタから正式名称を取得（あれば上書き）
                if store_code in stores:
                    store_name = stores[store_code]['name']

            # 2. PLマッピングから検索（固定マッピングにない場合）
            if not store_code and pl_name and pl_name in pl_mapping:
                store_code = pl_mapping[pl_name]
                if store_code in stores:
                    store_name = stores[store_code]['name']

            # 3. フォールバック: store_map_auto（それでも見つからない場合）
            if not store_code:
                store_name = store_map_auto.get(dept_code, f'店舗{dept_code}')
                # TKC部門コードの前に'TKC_'を付けて区別
                store_code = f'TKC_{dept_code}'
                store_name = auto_name

            store_columns.append((col, dept_code, store_code, store_name))

    # 各行を処理
    for idx, row in df.iterrows():
        account_name = str(row[account_col]).strip() if pd.notna(row[account_col]) else ''

        # 空行やヘッダー行をスキップ
        if not account_name or account_name in ['勘定科目名', '科目名', '']:
            continue

        # ノイズ行をスキップ
        if any(noise in account_name for noise in ['部門別損益', 'TKC', 'ページ', '損益計算書']):
            continue

        # 大項目を決定
        big_category = categorize_account(account_name)

        # 各店舗のデータを抽出
        for col, dept_code, store_code, store_name in store_columns:
            value = parse_numeric_value(row[col])

            if value is not None:
                records.append({
                    '年月': yearmonth,
                    '店舗コード': store_code,
                    '店舗名': store_name,
                    '大項目': big_category,
                    '中項目': account_name,
                    '単位': '円',
                    '区分': '実績',
                    '値': value
                })

    return records


def process_pl_folder(pl_folder: str, output_path: str) -> pd.DataFrame:
    """損益元データフォルダ内の全CSVを処理"""
    pl_folder = Path(pl_folder)
    all_records = []

    # store_map_auto.jsonを読み込み
    store_map_auto = load_store_map_auto(pl_folder)
    print(f"店舗マッピング（自動学習）: {len(store_map_auto)}件")

    # CSVファイルを検索（部門別損益比較表_*.csv）
    csv_patterns = [
        '部門別損益比較表_*.csv',
        '*損益*.csv',
    ]

    csv_files = []
    for pattern in csv_patterns:
        csv_files.extend(pl_folder.glob(pattern))

    # 重複除去
    csv_files = list(set(csv_files))

    if not csv_files:
        print(f"[WARN] CSVファイルが見つかりません: {pl_folder}")
        # PDFから変換されたCSVを探す
        print("  -> 既存スクリプトでPDFをCSV変換してください")
        return pd.DataFrame()

    print(f"\n処理対象CSVファイル: {len(csv_files)}件")

    for csv_file in sorted(csv_files):
        yearmonth = extract_yearmonth_from_filename(csv_file.name)
        if not yearmonth:
            print(f"  [SKIP] 年月が特定できません: {csv_file.name}")
            continue

        records = convert_pl_csv(csv_file, yearmonth, store_map_auto)
        if records:
            all_records.extend(records)
            print(f"  -> {csv_file.name}: {len(records)}件")

    if not all_records:
        print("\n[WARN] 変換されたレコードがありません")
        return pd.DataFrame()

    df = pd.DataFrame(all_records)

    # 重複除去
    df = df.drop_duplicates(subset=['年月', '店舗コード', '大項目', '中項目', '区分'], keep='last')

    # ソート
    df = df.sort_values(['年月', '店舗コード', '大項目', '中項目'])

    print(f"\n合計レコード数: {len(df)}")

    return df


def save_pl_data(df: pd.DataFrame, output_path: str, company_name: str, source_folder: str,
                 drive_folder_id: str = None):
    """損益データを保存"""
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    # JSON出力
    json_data = {
        'company_name': company_name,
        'generated_at': datetime.now().isoformat(),
        'format': 'long',
        'source_folder': str(source_folder),
        'total_records': len(df),
        'stores': df['店舗コード'].unique().tolist(),
        'yearmonths': sorted(df['年月'].unique().tolist()),
        'categories': df['大項目'].unique().tolist(),
        'data': df.to_dict(orient='records')
    }

    json_path = output_path / 'pl_data.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"\nJSON保存: {json_path}")

    # CSV出力
    csv_path = output_path / 'pl_data.csv'
    df.to_csv(csv_path, index=False, encoding='utf-8-sig')
    print(f"CSV保存: {csv_path}")

    # Google Driveアップロード
    if drive_folder_id:
        print('\nGoogle Driveにアップロード中...')
        service = get_drive_service()
        if service:
            json_content = json.dumps(json_data, ensure_ascii=False, indent=2).encode('utf-8')
            upload_to_drive(service, json_content, 'pl_data.json', drive_folder_id, 'application/json')

            csv_content = df.to_csv(index=False, encoding='utf-8-sig').encode('utf-8-sig')
            upload_to_drive(service, csv_content, 'pl_data.csv', drive_folder_id, 'text/csv')
        else:
            print('[WARN] Google Drive APIが利用できません')


def main():
    """メイン処理"""
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent

    # 損益データフォルダ（ローカルにコピー済み）
    pl_folder = project_dir / 'data' / 'junestory' / 'pl_source'

    # 出力先
    output_path = project_dir / 'data' / 'junestory'

    # 環境変数読み込み
    env_path = project_dir / '.env.local'
    if env_path.exists():
        setup_google_auth(str(env_path))

    print("========== 損益データ変換開始 ==========")

    # 変換実行
    df = process_pl_folder(pl_folder, str(output_path))

    if len(df) > 0:
        save_pl_data(
            df,
            str(output_path),
            '株式会社ジュネストリー',
            pl_folder,
            drive_folder_id=os.environ.get('GOOGLE_DRIVE_JUNESTORY_FOLDER_ID')
        )

        # サマリー
        print("\n========== サマリー ==========")
        print(f"店舗数: {df['店舗コード'].nunique()}")
        print(f"期間: {df['年月'].min()} ～ {df['年月'].max()}")
        print(f"大項目: {df['大項目'].unique().tolist()}")
    else:
        print("\n[INFO] CSVファイルがありません。")
        print("既存のPythonスクリプトでPDFをCSVに変換してから実行してください:")
        print(f"  python ジュネストリー様_損益試算表エクセル化_差し替え版_v4.py")


if __name__ == '__main__':
    main()

    # 次のスクリプトを自動実行
    print("\n" + "=" * 50)
    print("続けて マスターデータ作成を実行...")
    print("=" * 50 + "\n")
    from create_junestory_master_data import main as master_main
    master_main()
