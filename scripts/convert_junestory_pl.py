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
    upload_to_drive
)


# 店舗コードマッピング（TKC部門コード → 店舗コード）
# CSVヘッダーから取得した最新の対応表
TKC_STORE_MAPPING = {
    # グループ・共通
    '000': ('0000', '共通部門'),
    '500': ('0500', '飲食'),
    '700': ('0700', '鶏ヤローグループ'),
    '800': ('0800', '均タローグループ'),
    '810': ('0810', '魚衛門グループ'),
    '900': ('0900', 'フランチャイズ'),
    '998': ('0998', '閉鎖部門'),
    # 鶏ヤロー (2301-2305)
    '002': ('2301', '鶏ヤロー蒲田'),
    '005': ('2302', '鶏ヤロー平間'),
    '007': ('2303', '鶏ヤロー下北沢'),
    '009': ('2304', '鶏ヤロー横浜'),
    '018': ('2305', '鶏ヤロー歌舞伎町'),
    # 均タロー (1102-1120)
    '011': ('1102', '均タロー大宮'),
    '012': ('1103', '均タロー高田馬場'),
    '014': ('1104', '均タロー溝の口'),
    '017': ('1106', '均タロー渋谷'),
    '019': ('1107', '均タロー川越'),
    '020': ('1108', '均タロー橋本'),
    '022': ('1109', '均タロー吉祥寺'),
    '021': ('1110', '均タロー横浜'),
    '024': ('1111', '均タロー蒲田'),
    '026': ('1112', '均タロー平塚'),
    '027': ('1113', '均タロー浜松'),
    '008': ('1114', '均タロー下北沢'),
    '013': ('1115', '均タロー西葛西'),
    '015': ('1116', '均タロー上野'),
    '016': ('1117', '均タロー水道橋'),
    '101': ('1118', '均タロー神保町'),
    '102': ('1119', '均タロー大和'),
    '103': ('1120', '均タローすすきの'),
    # きんたろう (3102-3103)
    '006': ('3102', 'きんたろう練馬'),
    '023': ('3103', 'きんたろう本厚木'),
    # 魚ゑもん (4101-4103)
    '025': ('4101', '魚ゑもん柏'),
    '031': ('4102', '魚えもん新橋'),
    '029': ('4103', '魚えもん大井町'),
    # その他
    '010': ('9010', 'クローバー'),
    '028': ('9028', '店舗A'),
    '030': ('9030', '店舗C'),
}

# 勘定科目の大項目分類
ACCOUNT_CATEGORIES = {
    '売上高': ['売上高', '売上', '受取手数料', '営業収入'],
    '売上原価': ['売上原価', '仕入', '期首商品', '期末商品', '材料費'],
    '販管費': ['販売費', '管理費', '人件費', '賃借料', '水道光熱費', '減価償却費',
               '広告宣伝費', '旅費交通費', '通信費', '消耗品費', '修繕費', '租税公課',
               '保険料', '支払手数料', '雑費', '福利厚生費', '採用教育費', '荷造運賃'],
    '営業利益': ['営業利益', '売上総利益', '粗利'],
    '営業外': ['営業外収益', '営業外費用', '支払利息', '受取利息', '雑収入', '雑損失'],
    '経常利益': ['経常利益', '配賦後経常利益'],
}


def categorize_account(account_name: str) -> str:
    """勘定科目を大項目に分類"""
    for category, keywords in ACCOUNT_CATEGORIES.items():
        for keyword in keywords:
            if keyword in account_name:
                return category
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
    store_columns = []
    for col in columns:
        col_str = str(col).strip()
        match = re.search(r'\((\d{3})\)', col_str)
        if match:
            dept_code = match.group(1)
            store_info = TKC_STORE_MAPPING.get(dept_code)
            if not store_info:
                # store_map_autoから検索
                store_name = store_map_auto.get(dept_code, f'店舗{dept_code}')
                store_info = (dept_code, store_name)
            store_columns.append((col, dept_code, store_info[0], store_info[1]))

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
