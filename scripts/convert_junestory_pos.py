"""
ジュネストリーPOSデータを縦持ち形式に変換するスクリプト

入力: POS分析フォルダ内のCSVファイル
出力: pos_data.json（縦持ち形式）

対応CSVタイプ:
- dinii単品/売上: UTF-8, 魚えもん用
- fun単品/売上: UTF-8, 複数チェーン
- POS売上: Shift-JIS, 全店舗

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
import chardet

# convert_lib.pyの関数をインポート
from convert_lib import (
    setup_google_auth,
    get_drive_service,
    upload_to_drive,
    find_folder_by_name,
    load_junestory_master,
    ensure_file_downloaded
)


def load_store_master(master_path: str = None, service=None) -> dict:
    """店舗マスタを読み込む（Google Drive優先、フォールバックでローカル）"""
    # Google Driveから取得を試行
    master = load_junestory_master(service)
    if master:
        return {
            'stores': master['stores'],
            'mapping': master['mapping'],
            'company_name': master['company_name']
        }

    # フォールバック: ローカルファイル
    print('[INFO] ローカルファイルから店舗マスタを読み込み')
    with open(master_path, 'r', encoding='utf-8') as f:
        local_master = json.load(f)

    stores_by_code = {}
    for store in local_master['stores']:
        stores_by_code[store['store_code']] = store

    pos_code_mapping = local_master.get('pos_code_mapping', {})

    return {
        'stores': stores_by_code,
        'mapping': {'pos': pos_code_mapping, 'pl': {}, 'pos_name': {}, 'fun': {}, 'dinii': {}},
        'company_name': local_master['company_name']
    }


def detect_encoding(file_path: str) -> str:
    """ファイルのエンコーディングを検出"""
    # OneDriveファイルのダウンロードを確認
    if not ensure_file_downloaded(file_path):
        raise IOError(f"ファイルをダウンロードできません: {file_path}")

    with open(file_path, 'rb') as f:
        raw = f.read(10000)
    result = chardet.detect(raw)
    encoding = result['encoding']

    # cp932とshift_jisは同等扱い
    if encoding and encoding.lower() in ['shift_jis', 'shift-jis', 'sjis']:
        return 'cp932'
    if encoding and encoding.lower() in ['utf-8', 'utf-8-sig', 'ascii']:
        return 'utf-8-sig'

    return encoding or 'utf-8'


def extract_yearmonth_from_filename(filename: str) -> str:
    """ファイル名から年月を抽出"""
    # パターン1: YYYYMM形式 (例: 202512)
    match = re.search(r'(\d{6})', filename)
    if match:
        yyyymm = match.group(1)
        return f"{yyyymm[:4]}-{yyyymm[4:6]}"

    # パターン2: YYYY年MM月形式
    match = re.search(r'(\d{4})年(\d{1,2})月', filename)
    if match:
        year, month = match.groups()
        return f"{year}-{int(month):02d}"

    # パターン3: 日付範囲から終了月を取得 (YYYYMMDD-YYYYMMDD)
    match = re.search(r'\d{8}-(\d{4})(\d{2})\d{2}', filename)
    if match:
        year, month = match.groups()
        return f"{year}-{month}"

    return None


def extract_store_from_filename(filename: str, store_master: dict, source_type: str = 'pos') -> tuple:
    """ファイル名から店舗情報を抽出

    Args:
        filename: ファイル名
        store_master: 店舗マスタ
        source_type: 'pos', 'fun', 'dinii' のいずれか

    Returns:
        (store_code, store_name)
    """
    mapping = store_master.get('mapping', {})
    stores = store_master.get('stores', {})

    # POSコード形式: 002_xxx, 015_xxx等
    match = re.match(r'^(\d{3})_', filename)
    if match:
        pos_code = match.group(1)
        store_code = mapping.get('pos', {}).get(pos_code)
        if store_code and store_code in stores:
            return store_code, stores[store_code]['name']
        return pos_code, f"店舗{pos_code}"

    # POS店舗名でマッチ（完全一致優先）
    for pos_name, store_code in mapping.get('pos_name', {}).items():
        if pos_name in filename and store_code in stores:
            return store_code, stores[store_code]['name']

    # fun店舗名でマッチ
    if source_type == 'fun':
        for fun_name, store_code in mapping.get('fun', {}).items():
            if fun_name in filename and store_code in stores:
                return store_code, stores[store_code]['name']

    # dinii店舗名でマッチ
    if source_type == 'dinii':
        for dinii_name, store_code in mapping.get('dinii', {}).items():
            if dinii_name in filename and store_code in stores:
                return store_code, stores[store_code]['name']

    # フォールバック: 店舗名の部分一致
    for store_code, store in stores.items():
        store_name = store['name']
        simplified_name = store_name.replace('!', '').replace('！', '').replace(' ', '')
        if simplified_name in filename.replace(' ', ''):
            return store_code, store_name

    return None, None


def parse_numeric(value) -> float:
    """数値をパース（カンマ区切り、バックスラッシュ対応）"""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip()
    # バックスラッシュと円記号を除去
    s = s.replace('\\', '').replace('¥', '').replace('￥', '')
    # カンマを除去
    s = s.replace(',', '')
    # 空や非数値
    if not s or s in ['-', '－', '―', '−']:
        return None

    try:
        return float(s)
    except ValueError:
        return None


def convert_pos_sales_csv(csv_path: Path, store_master: dict) -> list:
    """POS売上CSVを縦持ち形式に変換（レジ集計データ）- 税抜き統一"""
    records = []

    filename = csv_path.name
    yearmonth = extract_yearmonth_from_filename(filename)
    store_code, store_name = extract_store_from_filename(filename, store_master)

    if not yearmonth or not store_code:
        print(f"  [SKIP] 年月または店舗が特定できません: {filename}")
        return []

    encoding = detect_encoding(str(csv_path))

    try:
        df = pd.read_csv(csv_path, encoding=encoding, header=0)
    except Exception as e:
        print(f"  [ERROR] CSV読み込み失敗: {filename} - {e}")
        return []

    # 日別データを月次集計
    monthly_totals = {}

    # カラム名の完全一致で取得
    col_mapping = {
        '純売上': '純売上高(税抜)',      # 税抜き純売上
        '売上': '売上高(税込)',          # 税込み売上（参考用）
        '客数': '客数',
        '組数(組)': '組数',
        '組数': '組数',
        '客単価': '客単価(税込)',        # 元データは税込みの可能性
    }

    for csv_col, output_name in col_mapping.items():
        if csv_col in df.columns:
            values = df[csv_col].apply(parse_numeric).dropna()
            if len(values) > 0:
                if '単価' in csv_col:
                    monthly_totals[output_name] = values.mean()
                else:
                    monthly_totals[output_name] = values.sum()

    # 税抜き客単価を計算（純売上 ÷ 客数）
    if '純売上高(税抜)' in monthly_totals and '客数' in monthly_totals and monthly_totals['客数'] > 0:
        monthly_totals['客単価(税抜)'] = monthly_totals['純売上高(税抜)'] / monthly_totals['客数']

    # 出力項目（税抜き中心）
    output_items = {
        '純売上高(税抜)': ('売上', '純売上高(税抜)', '円'),
        '客数': ('客数', '客数', '人'),
        '組数': ('客数', '組数', '組'),
        '客単価(税抜)': ('効率', '客単価(税抜)', '円'),
    }

    for key, (big, mid, unit) in output_items.items():
        if key in monthly_totals and monthly_totals[key] > 0:
            records.append({
                '年月': yearmonth,
                '店舗コード': store_code,
                '店舗名': store_name,
                '大項目': big,
                '中項目': mid,
                '単位': unit,
                '区分': '実績',
                '値': round(monthly_totals[key], 0) if unit == '円' else round(monthly_totals[key], 1)
            })

    return records


def convert_pos_items_csv(csv_path: Path, store_master: dict, data_type: str = 'sales') -> list:
    """POS単品CSVを縦持ち形式に変換"""
    records = []

    filename = csv_path.name
    yearmonth = extract_yearmonth_from_filename(filename)
    store_code, store_name = extract_store_from_filename(filename, store_master)

    if not yearmonth or not store_code:
        print(f"  [SKIP] 年月または店舗が特定できません: {filename}")
        return []

    encoding = detect_encoding(str(csv_path))

    try:
        df = pd.read_csv(csv_path, encoding=encoding, header=0)
    except Exception as e:
        print(f"  [ERROR] CSV読み込み失敗: {filename} - {e}")
        return []

    # 商品名カラムと数値カラムを特定
    item_col = None
    value_col = None

    for col in df.columns:
        col_str = str(col).strip()
        if '商品' in col_str or '品名' in col_str or 'メニュー' in col_str:
            item_col = col
        if data_type == 'sales' and ('売上' in col_str or '金額' in col_str):
            value_col = col
        elif data_type == 'volume' and ('出数' in col_str or '数量' in col_str or '販売数' in col_str):
            value_col = col

    if not item_col or not value_col:
        return []

    # 上位20商品のみ
    for idx, row in df.head(20).iterrows():
        item_name = str(row[item_col]).strip()
        value = parse_numeric(row[value_col])

        if item_name and value is not None:
            records.append({
                '年月': yearmonth,
                '店舗コード': store_code,
                '店舗名': store_name,
                '大項目': '単品',
                '中項目': item_name,
                '単位': '円' if data_type == 'sales' else '個',
                '区分': '実績',
                '値': value
            })

    return records


def convert_fun_sales_csv(csv_path: Path, store_master: dict) -> list:
    """fun売上CSVを縦持ち形式に変換 - 税抜き統一"""
    records = []

    filename = csv_path.name
    yearmonth = extract_yearmonth_from_filename(filename)

    # ファイル名から店舗名を抽出
    store_name_match = re.match(r'^([^_]+)_', filename)
    if not store_name_match:
        return []

    store_name_raw = store_name_match.group(1)
    mapping = store_master.get('mapping', {})
    stores = store_master.get('stores', {})

    # funマッピングで検索（完全一致優先）
    store_code, store_name = None, None
    for fun_name, code in mapping.get('fun', {}).items():
        if fun_name == store_name_raw or store_name_raw in fun_name or fun_name in store_name_raw:
            if code in stores:
                store_code = code
                store_name = stores[code]['name']
                break

    # フォールバック: 店舗マスタから部分一致検索
    if not store_code:
        for code, store in stores.items():
            name = store['name'].replace('!', '').replace('！', '').replace(' ', '')
            if store_name_raw.replace(' ', '') in name or name in store_name_raw.replace(' ', ''):
                store_code = code
                store_name = store['name']
                break

    if not store_code:
        store_code = 'UNKNOWN'
        store_name = store_name_raw

    if not yearmonth:
        return []

    try:
        df = pd.read_csv(csv_path, encoding='utf-8', header=0)
    except:
        try:
            df = pd.read_csv(csv_path, encoding='utf-8-sig', header=0)
        except Exception as e:
            print(f"  [ERROR] CSV読み込み失敗: {filename} - {e}")
            return []

    monthly_totals = {}

    # カラム名マッピング（元カラム → 集計キー）
    col_mapping = {
        '売上高（税抜）': '売上高(税抜)',
        '売上高（税込）': '売上高(税込)',
        '客数': '客数',
        '会計数': '会計数',
        '客単価': '客単価(税込)',  # funの客単価は税込みベースの可能性
        '商品販売数': '商品販売数',
    }

    for col in df.columns:
        col_clean = str(col).strip()
        for csv_key, output_key in col_mapping.items():
            if csv_key == col_clean:
                values = df[col].apply(parse_numeric).dropna()
                if len(values) > 0:
                    if '単価' in csv_key:
                        monthly_totals[output_key] = values.mean()
                    else:
                        monthly_totals[output_key] = values.sum()
                break

    # 税抜き客単価を計算（売上高(税抜) ÷ 客数）
    if '売上高(税抜)' in monthly_totals and '客数' in monthly_totals and monthly_totals['客数'] > 0:
        monthly_totals['客単価(税抜)'] = monthly_totals['売上高(税抜)'] / monthly_totals['客数']

    # 出力項目（税抜き中心）
    output_items = {
        '売上高(税抜)': ('売上', '純売上高(税抜)', '円'),
        '客数': ('客数', '客数', '人'),
        '会計数': ('客数', '会計数', '件'),
        '客単価(税抜)': ('効率', '客単価(税抜)', '円'),
        '商品販売数': ('販売', '商品販売数', '個'),
    }

    for key, (big, mid, unit) in output_items.items():
        if key in monthly_totals and monthly_totals[key] > 0:
            records.append({
                '年月': yearmonth,
                '店舗コード': store_code,
                '店舗名': store_name,
                '大項目': big,
                '中項目': mid,
                '単位': unit,
                '区分': '実績',
                '値': round(monthly_totals[key], 0) if unit == '円' else round(monthly_totals[key], 1)
            })

    return records


def convert_fun_items_csv(csv_path: Path, store_master: dict) -> list:
    """fun単品CSVを縦持ち形式に変換（ABC分析）"""
    records = []

    filename = csv_path.name
    yearmonth = extract_yearmonth_from_filename(filename)

    store_name_match = re.match(r'^([^_]+)_', filename)
    if not store_name_match:
        return []

    store_name_raw = store_name_match.group(1)
    mapping = store_master.get('mapping', {})
    stores = store_master.get('stores', {})

    # funマッピングで検索
    store_code, store_name = None, None
    for fun_name, code in mapping.get('fun', {}).items():
        if fun_name == store_name_raw or store_name_raw in fun_name or fun_name in store_name_raw:
            if code in stores:
                store_code = code
                store_name = stores[code]['name']
                break

    # フォールバック
    if not store_code:
        for code, store in stores.items():
            name = store['name'].replace('!', '').replace('！', '').replace(' ', '')
            if store_name_raw.replace(' ', '') in name or name in store_name_raw.replace(' ', ''):
                store_code = code
                store_name = store['name']
                break

    if not store_code:
        store_code = 'UNKNOWN'
        store_name = store_name_raw

    if not yearmonth:
        return []

    try:
        df = pd.read_csv(csv_path, encoding='utf-8', header=0)
    except:
        try:
            df = pd.read_csv(csv_path, encoding='utf-8-sig', header=0)
        except:
            return []

    # 商品名と売上/出数カラムを特定
    item_col = None
    sales_col = None
    qty_col = None

    for col in df.columns:
        col_str = str(col).strip()
        if '商品' in col_str or '品名' in col_str:
            item_col = col
        if '売上' in col_str or '期間売上高' in col_str:
            sales_col = col
        if '販売数' in col_str or '出数' in col_str or '期間販売数' in col_str:
            qty_col = col

    if not item_col:
        return []

    # 上位20商品
    for idx, row in df.head(20).iterrows():
        item_name = str(row[item_col]).strip()

        if sales_col:
            value = parse_numeric(row[sales_col])
            if item_name and value is not None:
                records.append({
                    '年月': yearmonth,
                    '店舗コード': store_code,
                    '店舗名': store_name,
                    '大項目': '単品売上',
                    '中項目': item_name,
                    '単位': '円',
                    '区分': '実績',
                    '値': value
                })

        if qty_col:
            value = parse_numeric(row[qty_col])
            if item_name and value is not None:
                records.append({
                    '年月': yearmonth,
                    '店舗コード': store_code,
                    '店舗名': store_name,
                    '大項目': '単品出数',
                    '中項目': item_name,
                    '単位': '個',
                    '区分': '実績',
                    '値': value
                })

    return records


def convert_dinii_sales_csv(csv_path: Path, store_master: dict) -> list:
    """dinii売上CSVを縦持ち形式に変換 - 税抜き統一"""
    records = []

    filename = csv_path.name
    mapping = store_master.get('mapping', {})
    stores = store_master.get('stores', {})

    try:
        df = pd.read_csv(csv_path, encoding='utf-8-sig', header=0)
    except:
        try:
            df = pd.read_csv(csv_path, encoding='utf-8', header=0)
        except:
            return []

    # 店舗名カラムと日付カラムを確認
    store_col = None
    date_col = None

    for col in df.columns:
        if '店舗' in str(col):
            store_col = col
        if '日付' in str(col):
            date_col = col

    if not date_col:
        return []

    # 店舗特定（diniiマッピング使用）
    store_code = '4101'  # デフォルトで柏店
    store_name = stores.get('4101', {}).get('name', '魚ゑもん柏店')

    if store_col and len(df) > 0:
        first_store = str(df[store_col].iloc[0])
        # diniiマッピングで検索
        for dinii_name, code in mapping.get('dinii', {}).items():
            if dinii_name in first_store or first_store in dinii_name:
                if code in stores:
                    store_code = code
                    store_name = stores[code]['name']
                    break
        else:
            # フォールバック: キーワードで判定
            if '新橋' in first_store:
                store_code = '4102'
                store_name = stores.get('4102', {}).get('name', '魚ゑもん新橋店')
            elif '大井町' in first_store:
                store_code = '4103'
                store_name = stores.get('4103', {}).get('name', '魚ゑもん大井町店')

    # 日別データを月次集計
    df['日付'] = pd.to_datetime(df[date_col])
    df['年月'] = df['日付'].dt.strftime('%Y-%m')

    for yearmonth, group in df.groupby('年月'):
        monthly_totals = {}

        # 売上（diniiは税込みの可能性が高い）
        if '売上' in df.columns:
            values = group['売上'].apply(parse_numeric).dropna()
            if len(values) > 0:
                sales_incl_tax = values.sum()
                # 税抜きに変換（10%税率）
                monthly_totals['純売上高(税抜)'] = sales_incl_tax / 1.1

        # 客数
        if '客数' in df.columns:
            values = group['客数'].apply(parse_numeric).dropna()
            if len(values) > 0:
                monthly_totals['客数'] = values.sum()

        # 組数
        if '組数' in df.columns:
            values = group['組数'].apply(parse_numeric).dropna()
            if len(values) > 0:
                monthly_totals['組数'] = values.sum()

        # 税抜き客単価を計算
        if '純売上高(税抜)' in monthly_totals and '客数' in monthly_totals and monthly_totals['客数'] > 0:
            monthly_totals['客単価(税抜)'] = monthly_totals['純売上高(税抜)'] / monthly_totals['客数']

        # 出力項目
        output_items = {
            '純売上高(税抜)': ('売上', '純売上高(税抜)', '円'),
            '客数': ('客数', '客数', '人'),
            '組数': ('客数', '組数', '組'),
            '客単価(税抜)': ('効率', '客単価(税抜)', '円'),
        }

        for key, (big, mid, unit) in output_items.items():
            if key in monthly_totals and monthly_totals[key] > 0:
                records.append({
                    '年月': yearmonth,
                    '店舗コード': store_code,
                    '店舗名': store_name,
                    '大項目': big,
                    '中項目': mid,
                    '単位': unit,
                    '区分': '実績',
                    '値': round(monthly_totals[key], 0) if unit == '円' else round(monthly_totals[key], 1)
                })

    return records


def process_all_pos_data(pos_folder: str, store_master: dict, output_path: str) -> pd.DataFrame:
    """POS分析フォルダ内の全CSVを処理"""
    pos_folder = Path(pos_folder)
    all_records = []

    subfolders = {
        'POS売上': ('pos_sales', convert_pos_sales_csv),
        'POS単品売上': ('pos_items_sales', lambda p, m: convert_pos_items_csv(p, m, 'sales')),
        'POS単品出数': ('pos_items_volume', lambda p, m: convert_pos_items_csv(p, m, 'volume')),
        'fun売上': ('fun_sales', convert_fun_sales_csv),
        'fun単品': ('fun_items', convert_fun_items_csv),
        'dinii売上': ('dinii_sales', convert_dinii_sales_csv),
    }

    for subfolder_name, (data_type, converter) in subfolders.items():
        subfolder_path = pos_folder / subfolder_name
        if not subfolder_path.exists():
            print(f"[SKIP] フォルダなし: {subfolder_name}")
            continue

        print(f"\n処理中: {subfolder_name}")
        csv_files = list(subfolder_path.glob('*.csv'))
        print(f"  ファイル数: {len(csv_files)}")

        for csv_file in csv_files:
            try:
                records = converter(csv_file, store_master)
                if records:
                    all_records.extend(records)
                    print(f"  -> {csv_file.name}: {len(records)}件")
            except Exception as e:
                print(f"  [ERROR] {csv_file.name}: {e}")

    # DataFrame変換
    if not all_records:
        print("\n[WARN] 変換されたレコードがありません")
        return pd.DataFrame()

    df = pd.DataFrame(all_records)

    # 重複除去（同じ年月・店舗・項目は最新のみ）
    df = df.drop_duplicates(subset=['年月', '店舗コード', '大項目', '中項目', '区分'], keep='last')

    # ソート
    df = df.sort_values(['年月', '店舗コード', '大項目', '中項目'])

    print(f"\n合計レコード数: {len(df)}")

    return df


def save_pos_data(df: pd.DataFrame, output_path: str, company_name: str, source_folder: str,
                  drive_folder_id: str = None):
    """POSデータを保存"""
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    # JSON出力
    json_data = {
        'company_name': company_name,
        'generated_at': datetime.now().isoformat(),
        'format': 'long',
        'source_folder': source_folder,
        'total_records': len(df),
        'stores': df['店舗コード'].unique().tolist(),
        'yearmonths': sorted(df['年月'].unique().tolist()),
        'data': df.to_dict(orient='records')
    }

    json_path = output_path / 'pos_data.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"\nJSON保存: {json_path}")

    # CSV出力
    csv_path = output_path / 'pos_data.csv'
    df.to_csv(csv_path, index=False, encoding='utf-8-sig')
    print(f"CSV保存: {csv_path}")

    # Google Driveアップロード
    if drive_folder_id:
        print('\nGoogle Driveにアップロード中...')
        service = get_drive_service()
        if service:
            json_content = json.dumps(json_data, ensure_ascii=False, indent=2).encode('utf-8')
            upload_to_drive(service, json_content, 'pos_data.json', drive_folder_id, 'application/json')

            csv_content = df.to_csv(index=False, encoding='utf-8-sig').encode('utf-8-sig')
            upload_to_drive(service, csv_content, 'pos_data.csv', drive_folder_id, 'text/csv')
        else:
            print('[WARN] Google Drive APIが利用できません')


def main():
    """メイン処理"""
    # パス設定
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent

    # 環境変数読み込み（Google Drive用）
    env_path = project_dir / '.env.local'
    if env_path.exists():
        setup_google_auth(str(env_path))

    # 店舗マスタ読み込み（Google Drive優先）
    store_master_path = script_dir / 'junestory_stores.json'
    store_master = load_store_master(str(store_master_path))
    print(f"店舗マスタ読み込み: {len(store_master['stores'])}店舗")

    # POSデータフォルダ
    pos_folder = r"c:\Users\yasuh\OneDrive - 株式会社日本コンサルタントグループ　\MyDocuments\00_Junes\2026年10月期_データ\POS分析"

    # 出力先
    output_path = project_dir / 'data' / 'junestory'

    # 環境変数読み込み（Google Drive用）
    env_path = project_dir / '.env.local'
    if env_path.exists():
        setup_google_auth(str(env_path))

    # 変換実行
    print("\n========== POS データ変換開始 ==========")
    df = process_all_pos_data(pos_folder, store_master, str(output_path))

    if len(df) > 0:
        # 保存
        save_pos_data(
            df,
            str(output_path),
            store_master['company_name'],
            pos_folder,
            drive_folder_id=os.environ.get('GOOGLE_DRIVE_JUNESTORY_FOLDER_ID')
        )

        # サマリー
        print("\n========== サマリー ==========")
        print(f"店舗数: {df['店舗コード'].nunique()}")
        print(f"期間: {df['年月'].min()} ～ {df['年月'].max()}")
        print(f"大項目: {df['大項目'].unique().tolist()}")


if __name__ == '__main__':
    main()

    # 次のスクリプトを自動実行
    print("\n" + "=" * 50)
    print("続けて PL データ変換を実行...")
    print("=" * 50 + "\n")
    from convert_junestory_pl import main as pl_main
    pl_main()
