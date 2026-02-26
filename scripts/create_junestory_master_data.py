"""
ジュネストリーのPOS/PLデータをmaster_data.json形式に統合

他企業と同じ形式でダッシュボードに表示できるようにする

区分一覧（14種類）:
- 実績、実績平均、実績累計
- 前年、前年平均、前年累計
- 計画、計画平均、計画累計（計画データがあれば）
- 前年比、計画比
- 売上比、前年売上比、計画売上比（PLの利益・費用のみ）
"""

import json
import os
import sys
import csv
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import setup_google_auth, get_drive_service, load_junestory_master, ensure_file_downloaded

JUNESTORY_FOLDER_ID = '1Bt8WpIQWUiHiOCct_c1AikDOZ5CKprCL'

# TKC部門コード → 正式店番マッピング
# PLデータのカラム名に含まれるTKC部門コード（3桁）を正式店番に変換
TKC_TO_OFFICIAL = {
    # グループ・共通（そのまま4桁に）
    '000': '0000', '500': '0500', '700': '0700', '800': '0800',
    '810': '0810', '900': '0900', '998': '0998',
    # 鶏ヤロー (2301-2305)
    '002': '2301', '005': '2302', '007': '2303', '009': '2304', '018': '2305',
    # 均タロー (1102-1120)
    '011': '1102', '012': '1103', '014': '1104', '017': '1106', '019': '1107',
    '020': '1108', '022': '1109', '021': '1110', '024': '1111', '026': '1112',
    '027': '1113', '008': '1114', '013': '1115', '015': '1116', '016': '1117',
    '101': '1118', '102': '1119', '103': '1120',
    # きんたろう (3101-3102)
    '006': '3102', '023': '3101',
    # 魚ゑもん (4101-4103)
    '025': '4101', '031': '4102', '029': '4103',
    # その他
    '010': '9010', '028': '9028', '030': '9030',
}

def normalize_store_code(code: str) -> str:
    """店舗コードを正式店番に正規化"""
    if not code:
        return code
    # TKC部門コードの場合は変換
    if code in TKC_TO_OFFICIAL:
        return TKC_TO_OFFICIAL[code]
    # 先頭の0を除去した形もチェック
    stripped = code.lstrip('0') or '0'
    if stripped in TKC_TO_OFFICIAL:
        return TKC_TO_OFFICIAL[stripped]
    return code

# 店舗マスタ（Google Driveから読み込み）
_STORE_MASTER_CACHE = None


def get_store_master_from_drive():
    """店舗マスタをGoogle Driveから取得（キャッシュ付き）"""
    global _STORE_MASTER_CACHE
    if _STORE_MASTER_CACHE is None:
        _STORE_MASTER_CACHE = load_junestory_master()
    return _STORE_MASTER_CACHE

def load_json(filepath):
    """JSONファイルを読み込み"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_prev_year_month(yearmonth: str) -> str:
    """前年同月を取得"""
    year, month = yearmonth.split('-')
    return f"{int(year)-1}-{month}"


def get_fiscal_year(yearmonth: str) -> str:
    """年度を取得（11月始まり・10月決算）

    決算期間: 11月～翌年10月
    例: 2024-11 ～ 2025-10 → 2025年10月期
    """
    year, month = yearmonth.split('-')
    month_int = int(month)
    # 11月以降は翌年度（例: 2024-11 → 2025年10月期）
    if month_int >= 11:
        return f"{int(year)+1}"
    else:
        return f"{year}"


def get_month_index_in_fiscal_year(yearmonth: str) -> int:
    """年度内の月インデックスを取得（11月=1, 12月=2, ..., 10月=12）"""
    month_int = int(yearmonth.split('-')[1])
    if month_int >= 11:
        return month_int - 10  # 11月=1, 12月=2
    else:
        return month_int + 2   # 1月=3, ..., 10月=12


# ========== 曜日別データ集計 ==========
# POSの日別データから曜日別に集計

WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']
POS_ANALYSIS_FOLDER = Path(r"c:\Users\yasuh\OneDrive - 株式会社日本コンサルタントグループ　\MyDocuments\00_Junes\2026年10月期_データ\POS分析")


def get_weekday_from_date(date_str: str) -> str:
    """日付文字列から曜日を取得"""
    date_str = date_str.strip()
    # 曜日が既に含まれている場合
    match = re.search(r'\(([月火水木金土日])\)', date_str)
    if match:
        return match.group(1)
    # 日付をパース
    for fmt in ['%Y/%m/%d', '%Y-%m-%d']:
        try:
            dt = datetime.strptime(date_str.split('(')[0], fmt)
            return WEEKDAY_NAMES[dt.weekday()]
        except:
            pass
    return None


def parse_number_str(value) -> float:
    """数値をパース（カンマ、円記号などを除去）"""
    if value is None or value == '':
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace(',', '').replace('\\', '').replace('¥', '').replace('"', '').strip()
    try:
        return float(s) if s else 0
    except:
        return 0


def load_dinii_weekday_data(folder_path: Path) -> list:
    """dinii売上フォルダから日別データを読み込み"""
    records = []
    if not folder_path.exists():
        return records

    for csv_file in folder_path.glob('売上分析_日別_*.csv'):
        if not ensure_file_downloaded(str(csv_file)):
            print(f"  警告: ファイルをダウンロードできませんでした: {csv_file.name}")
            continue
        with open(csv_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row.get('日付', '')
                if not date_str:
                    continue
                weekday = get_weekday_from_date(date_str)
                if not weekday:
                    continue
                try:
                    dt = datetime.strptime(date_str, '%Y/%m/%d')
                    yearmonth = dt.strftime('%Y-%m')
                except:
                    continue
                records.append({
                    'store_name': row.get('店舗名', ''),
                    'yearmonth': yearmonth,
                    'weekday': weekday,
                    'sales': parse_number_str(row.get('売上', 0)),
                    'customers': parse_number_str(row.get('客数', 0)),
                    'groups': parse_number_str(row.get('組数', 0)),
                })
    return records


def load_fun_weekday_data(folder_path: Path) -> list:
    """fun売上フォルダから日別データを読み込み"""
    records = []
    if not folder_path.exists():
        return records

    for csv_file in folder_path.glob('*_売上詳細_*.csv'):
        if not ensure_file_downloaded(str(csv_file)):
            print(f"  警告: ファイルをダウンロードできませんでした: {csv_file.name}")
            continue
        store_name = csv_file.name.split('_売上詳細')[0]
        with open(csv_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row.get('集計期間', '')
                if not date_str or '/' not in date_str:
                    continue
                weekday = get_weekday_from_date(date_str)
                if not weekday:
                    continue
                try:
                    dt = datetime.strptime(date_str, '%Y/%m/%d')
                    yearmonth = dt.strftime('%Y-%m')
                except:
                    continue
                records.append({
                    'store_name': store_name,
                    'yearmonth': yearmonth,
                    'weekday': weekday,
                    'sales': parse_number_str(row.get('売上高（税抜）', 0)),
                    'customers': parse_number_str(row.get('客数', 0)),
                    'groups': parse_number_str(row.get('会計数', 0)),
                })
    return records


def load_pos_weekday_data(folder_path: Path) -> list:
    """POS売上フォルダから日別データを読み込み"""
    records = []
    if not folder_path.exists():
        return records

    for csv_file in folder_path.glob('*_レジ_*.csv'):
        if not ensure_file_downloaded(str(csv_file)):
            print(f"  警告: ファイルをダウンロードできませんでした: {csv_file.name}")
            continue
        parts = csv_file.name.split('_')
        store_name = parts[1] if len(parts) > 1 else ''
        try:
            with open(str(csv_file), 'r', encoding='shift_jis', errors='replace') as f:
                reader = csv.reader(f)
                next(reader, None)  # skip header
                for row in reader:
                    if len(row) <= 8:
                        continue
                    date_str = row[0]
                    if not date_str or date_str == 'TOTAL':
                        continue
                    weekday = get_weekday_from_date(date_str)
                    if not weekday:
                        continue
                    try:
                        dt = datetime.strptime(date_str.split('(')[0], '%Y/%m/%d')
                        yearmonth = dt.strftime('%Y-%m')
                    except:
                        continue
                    records.append({
                        'store_name': store_name,
                        'yearmonth': yearmonth,
                        'weekday': weekday,
                        'sales': parse_number_str(row[8]),
                        'customers': parse_number_str(row[2]),
                        'groups': parse_number_str(row[1]),
                    })
        except Exception:
            continue
    return records


def create_weekday_records(store_names: dict) -> list:
    """曜日別データを集計してmaster_data形式で返す"""
    if not POS_ANALYSIS_FOLDER.exists():
        print("[INFO] POS分析フォルダがありません - 曜日別データをスキップ")
        return []

    # 日別データを読み込み
    all_records = []
    all_records.extend(load_dinii_weekday_data(POS_ANALYSIS_FOLDER / 'dinii売上'))
    all_records.extend(load_fun_weekday_data(POS_ANALYSIS_FOLDER / 'fun売上'))
    all_records.extend(load_pos_weekday_data(POS_ANALYSIS_FOLDER / 'POS売上'))

    if not all_records:
        return []

    # 店舗×年月×曜日でグループ化
    grouped = defaultdict(lambda: {'sales': 0, 'customers': 0, 'groups': 0, 'count': 0})
    for r in all_records:
        key = (r['store_name'], r['yearmonth'], r['weekday'])
        grouped[key]['sales'] += r['sales']
        grouped[key]['customers'] += r['customers']
        grouped[key]['groups'] += r['groups']
        grouped[key]['count'] += 1

    # 店舗名→店舗コードのマッピング
    store_code_map = {v: k for k, v in store_names.items()}

    # master_data形式に変換
    result = []
    for (store_name, yearmonth, weekday), data in grouped.items():
        if data['count'] == 0:
            continue

        avg_sales = round(data['sales'] / data['count'])
        avg_customers = round(data['customers'] / data['count'], 1)
        avg_groups = round(data['groups'] / data['count'], 1)
        avg_spend = round(data['sales'] / data['customers']) if data['customers'] > 0 else 0
        persons_per_group = round(data['customers'] / data['groups'], 2) if data['groups'] > 0 else 0

        # 店舗コードを検索
        store_code = ''
        for name, code in store_code_map.items():
            if name in store_name or store_name in name:
                store_code = code
                break

        base = {'年月': yearmonth, '部門': store_name, '店舗コード': store_code, '大項目': 'POS_曜日別', '区分': '実績'}
        result.append({**base, '中項目': f'曜日別売上高_{weekday}', '単位': '円', '値': avg_sales})
        result.append({**base, '中項目': f'曜日別客数_{weekday}', '単位': '人', '値': avg_customers})
        result.append({**base, '中項目': f'曜日別客単価_{weekday}', '単位': '円', '値': avg_spend})
        result.append({**base, '中項目': f'曜日別組数_{weekday}', '単位': '組', '値': avg_groups})
        result.append({**base, '中項目': f'曜日別組人数_{weekday}', '単位': '人', '値': persons_per_group})

    return result


def create_master_data():
    """POS/PLデータを統合してmaster_data形式に変換"""
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    data_dir = project_dir / 'data' / 'junestory'

    # データ読み込み
    pos_data = load_json(data_dir / 'pos_data.json')
    pl_data = load_json(data_dir / 'pl_data.json')

    # 店舗マスタをGoogle Driveから取得
    drive_master = get_store_master_from_drive()

    # エンティティ（店舗）マッピング（Google Drive優先、フォールバックでローカル）
    if drive_master and drive_master.get('stores'):
        store_names = {code: info['name'] for code, info in drive_master['stores'].items()}
        store_info_map = drive_master['stores']
        print(f"[INFO] Google Driveから店舗マスタ取得: {len(store_names)}店舗")
    else:
        stores_data = load_json(script_dir / 'junestory_stores.json')
        store_names = {s['store_code']: s['name'] for s in stores_data['stores']}
        store_info_map = {s['store_code']: s for s in stores_data['stores']}
        print(f"[INFO] ローカルから店舗マスタ取得: {len(store_names)}店舗")

    # 統合データを作成
    combined_data = []

    # ========== 比率項目の定義 ==========
    # 比率項目は累計を「分子累計÷分母累計」で計算する
    # format: { 項目名: (分子項目名, 分母項目名, 単位) }
    RATIO_ITEMS = {
        '客単価(税抜)': ('純売上高(税抜)', '客数', '円'),
        '組単価': ('純売上高(税抜)', '組数', '円'),
        '組人数': ('客数', '組数', '人'),
    }

    # ========== POSデータ処理 ==========
    pos_records = pos_data.get('data', [])

    # POSデータの店舗コードを正規化
    for record in pos_records:
        raw_code = record.get('店舗コード', '')
        record['店舗コード'] = normalize_store_code(raw_code)

    # POSデータをインデックス化
    pos_index = {}
    for record in pos_records:
        key = (record.get('年月'), record.get('店舗コード'), record.get('中項目'))
        pos_index[key] = record.get('値')

    # 組単価・組人数を計算して追加（元データにない場合）
    # まず、年月×店舗コードの組み合わせを取得
    yearmonth_store_pairs = set()
    for record in pos_records:
        ym = record.get('年月')
        sc = record.get('店舗コード')
        sn = record.get('店舗名')
        if ym and sc:
            yearmonth_store_pairs.add((ym, sc, sn))

    # 組単価・組人数を生成
    generated_ratio_records = []
    for ym, sc, sn in yearmonth_store_pairs:
        store_name = store_names.get(sc, sn or sc)

        # 必要なデータを取得
        sales = pos_index.get((ym, sc, '純売上高(税抜)'))
        customers = pos_index.get((ym, sc, '客数'))
        groups = pos_index.get((ym, sc, '組数'))

        # 組単価: 純売上高 / 組数
        if sales is not None and groups is not None and groups > 0:
            if (ym, sc, '組単価') not in pos_index:
                group_unit_price = round(sales / groups, 1)
                pos_index[(ym, sc, '組単価')] = group_unit_price
                generated_ratio_records.append({
                    '年月': ym,
                    '店舗コード': sc,
                    '店舗名': store_name,
                    '大項目': '効率',
                    '中項目': '組単価',
                    '単位': '円',
                    '値': group_unit_price,
                })

        # 組人数: 客数 / 組数
        if customers is not None and groups is not None and groups > 0:
            if (ym, sc, '組人数') not in pos_index:
                persons_per_group = round(customers / groups, 2)
                pos_index[(ym, sc, '組人数')] = persons_per_group
                generated_ratio_records.append({
                    '年月': ym,
                    '店舗コード': sc,
                    '店舗名': store_name,
                    '大項目': '効率',
                    '中項目': '組人数',
                    '単位': '人',
                    '値': persons_per_group,
                })

    # 生成した比率レコードをpos_recordsに追加
    pos_records = pos_records + generated_ratio_records
    print(f"生成した比率レコード: {len(generated_ratio_records)}")

    # POS累計・平均計算用
    pos_cumulative = defaultdict(float)  # (年度, 店舗コード, 中項目) -> 累計値
    pos_count = defaultdict(int)         # (年度, 店舗コード, 中項目) -> 月数
    pos_prev_cumulative = defaultdict(float)  # 前年累計
    pos_prev_count = defaultdict(int)

    # レコードを並べ替え：比率項目は分子・分母の後に処理する
    def sort_key(record):
        item = record.get('中項目', '')
        yearmonth = record.get('年月', '')
        store_code = record.get('店舗コード', '')
        # 比率項目は後ろに（sort order = 1）、それ以外は先に（sort order = 0）
        is_ratio = 1 if item in RATIO_ITEMS else 0
        return (yearmonth, store_code, is_ratio, item)

    sorted_pos_records = sorted(pos_records, key=sort_key)

    for record in sorted_pos_records:
        yearmonth = record.get('年月', '')
        store_code = record.get('店舗コード', '')
        store_name = store_names.get(store_code, record.get('店舗名', store_code))
        category = record.get('大項目', '')
        item = record.get('中項目', '')
        unit = record.get('単位', '')
        value = record.get('値')

        big_category = f"POS_{category}"
        fiscal_year = get_fiscal_year(yearmonth)
        cum_key = (fiscal_year, store_code, item)

        # 実績
        combined_data.append({
            '年月': yearmonth,
            '部門': store_name,
            '店舗コード': store_code,
            '大項目': big_category,
            '中項目': item,
            '単位': unit,
            '区分': '実績',
            '値': value,
        })

        # 実績累計・平均
        if value is not None:
            # 比率項目かどうかをチェック
            if item in RATIO_ITEMS:
                # 比率項目は分子・分母の累計から計算
                numerator_item, denominator_item, _ = RATIO_ITEMS[item]
                num_key = (fiscal_year, store_code, numerator_item)
                den_key = (fiscal_year, store_code, denominator_item)

                # 分子・分母の累計値を取得（既に加算済みのはず）
                num_cum = pos_cumulative.get(num_key, 0)
                den_cum = pos_cumulative.get(den_key, 0)

                # 累計値を計算（分母が0でない場合のみ）
                if den_cum > 0:
                    cum_value = round(num_cum / den_cum, 1)
                else:
                    cum_value = 0

                # 平均は各月の値の単純平均
                pos_cumulative[cum_key] += value
                pos_count[cum_key] += 1
                avg_value = round(pos_cumulative[cum_key] / pos_count[cum_key], 1)
            else:
                # 通常項目は単純累計
                pos_cumulative[cum_key] += value
                pos_count[cum_key] += 1
                cum_value = pos_cumulative[cum_key]
                avg_value = round(cum_value / pos_count[cum_key], 1)

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '実績累計',
                '値': cum_value,
            })

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '実績平均',
                '値': avg_value,
            })

        # 前年実績
        prev_yearmonth = get_prev_year_month(yearmonth)
        prev_key = (prev_yearmonth, store_code, item)
        prev_value = pos_index.get(prev_key)

        if prev_value is not None:
            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年',
                '値': prev_value,
            })

            # 前年累計・平均
            prev_fiscal_year = get_fiscal_year(prev_yearmonth)
            prev_cum_key = (prev_fiscal_year, store_code, item, 'prev')

            # 比率項目かどうかをチェック
            if item in RATIO_ITEMS:
                # 比率項目は分子・分母の前年累計から計算
                numerator_item, denominator_item, _ = RATIO_ITEMS[item]
                num_prev_key = (prev_fiscal_year, store_code, numerator_item, 'prev')
                den_prev_key = (prev_fiscal_year, store_code, denominator_item, 'prev')

                num_prev_cum = pos_prev_cumulative.get(num_prev_key, 0)
                den_prev_cum = pos_prev_cumulative.get(den_prev_key, 0)

                if den_prev_cum > 0:
                    prev_cum_value = round(num_prev_cum / den_prev_cum, 1)
                else:
                    prev_cum_value = 0

                pos_prev_cumulative[prev_cum_key] += prev_value
                pos_prev_count[prev_cum_key] += 1
                prev_avg = round(pos_prev_cumulative[prev_cum_key] / pos_prev_count[prev_cum_key], 1)
            else:
                pos_prev_cumulative[prev_cum_key] += prev_value
                pos_prev_count[prev_cum_key] += 1
                prev_cum_value = pos_prev_cumulative[prev_cum_key]
                prev_avg = round(prev_cum_value / pos_prev_count[prev_cum_key], 1)

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年累計',
                '値': prev_cum_value,
            })

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年平均',
                '値': prev_avg,
            })

            # 前年比（%）
            if prev_value != 0 and value is not None:
                yoy_ratio = round((value / prev_value) * 100, 1)
                combined_data.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': big_category,
                    '中項目': item,
                    '単位': '%',
                    '区分': '前年比',
                    '値': yoy_ratio,
                })

    # ========== PLデータ処理 ==========
    pl_records = pl_data.get('data', [])

    # PLデータの店舗コードを正規化
    for record in pl_records:
        raw_code = record.get('店舗コード', '')
        record['店舗コード'] = normalize_store_code(raw_code)

    # 売上高を取得（比率計算用）
    sales_by_store_month = {}
    prev_sales_by_store_month = {}

    for record in pl_records:
        if record.get('中項目') in ['純売上高', '飲食店売上高合計']:
            key = (record.get('年月'), record.get('店舗コード'))
            if record.get('中項目') == '純売上高' or key not in sales_by_store_month:
                sales_by_store_month[key] = record.get('値', 0)

    # 前年売上高もインデックス化
    for (ym, sc), val in sales_by_store_month.items():
        prev_ym = get_prev_year_month(ym)
        prev_key = (prev_ym, sc)
        if prev_key in sales_by_store_month:
            prev_sales_by_store_month[(ym, sc)] = sales_by_store_month[prev_key]

    # PLデータをインデックス化
    pl_index = {}
    for record in pl_records:
        key = (record.get('年月'), record.get('店舗コード'), record.get('中項目'))
        pl_index[key] = record.get('値')

    # PL累計・平均計算用
    pl_cumulative = defaultdict(float)
    pl_count = defaultdict(int)
    pl_prev_cumulative = defaultdict(float)
    pl_prev_count = defaultdict(int)

    # 売上累計（売上比累計の分母用）- 事前計算
    sales_cumulative = defaultdict(float)  # (fiscal_year, store_code, yearmonth) -> 累計売上
    prev_sales_cumulative = defaultdict(float)  # 前年売上累計

    # 年月でソートして売上累計を事前計算
    sales_items = ['純売上高', '飲食店売上高合計']
    yearmonths_sorted = sorted(set(r.get('年月') for r in pl_records if r.get('年月')))

    for store_code in store_names.keys():
        for fiscal_year in set(get_fiscal_year(ym) for ym in yearmonths_sorted):
            running_sales = 0
            running_prev_sales = 0
            for ym in yearmonths_sorted:
                if get_fiscal_year(ym) != fiscal_year:
                    continue
                # 当期売上
                for sales_item in sales_items:
                    key = (ym, store_code, sales_item)
                    val = pl_index.get(key)
                    if val is not None:
                        running_sales += val
                        break
                sales_cumulative[(fiscal_year, store_code, ym)] = running_sales

                # 前年売上
                prev_ym = get_prev_year_month(ym)
                for sales_item in sales_items:
                    prev_key = (prev_ym, store_code, sales_item)
                    prev_val = pl_index.get(prev_key)
                    if prev_val is not None:
                        running_prev_sales += prev_val
                        break
                prev_sales_cumulative[(fiscal_year, store_code, ym)] = running_prev_sales

    for record in pl_records:
        yearmonth = record.get('年月', '')
        store_code = record.get('店舗コード', '')
        store_name = store_names.get(store_code, record.get('店舗名', store_code))
        category = record.get('大項目', '')
        item = record.get('中項目', '')
        unit = record.get('単位', '')
        value = record.get('値')

        big_category = f"PL_{category}"
        fiscal_year = get_fiscal_year(yearmonth)
        cum_key = (fiscal_year, store_code, item)

        # 実績
        combined_data.append({
            '年月': yearmonth,
            '部門': store_name,
            '店舗コード': store_code,
            '大項目': big_category,
            '中項目': item,
            '単位': unit,
            '区分': '実績',
            '値': value,
        })

        # 実績累計・平均
        if value is not None:
            pl_cumulative[cum_key] += value
            pl_count[cum_key] += 1

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '実績累計',
                '値': pl_cumulative[cum_key],
            })

            avg_value = round(pl_cumulative[cum_key] / pl_count[cum_key], 1)
            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '実績平均',
                '値': avg_value,
            })

        # 売上比（%）- PLの利益・費用項目（月次）
        sales_key = (yearmonth, store_code)
        sales = sales_by_store_month.get(sales_key, 0)
        if sales and sales != 0 and value is not None:
            ratio = round((value / sales) * 100, 1)
            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': '%',
                '区分': '売上比',
                '値': ratio,
            })

        # 売上比累計（%）- PLの利益・費用項目（累計ベース）
        if value is not None:
            sales_cum_key = (fiscal_year, store_code, yearmonth)
            cum_sales = sales_cumulative.get(sales_cum_key, 0)
            if cum_sales and cum_sales != 0:
                cum_ratio = round((pl_cumulative[cum_key] / cum_sales) * 100, 1)
                combined_data.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': big_category,
                    '中項目': item,
                    '単位': '%',
                    '区分': '売上比累計',
                    '値': cum_ratio,
                })

        # 前年実績
        prev_yearmonth = get_prev_year_month(yearmonth)
        prev_key = (prev_yearmonth, store_code, item)
        prev_value = pl_index.get(prev_key)

        if prev_value is not None:
            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年',
                '値': prev_value,
            })

            # 前年累計・平均
            prev_fiscal_year = get_fiscal_year(prev_yearmonth)
            prev_cum_key = (prev_fiscal_year, store_code, item, 'prev')
            pl_prev_cumulative[prev_cum_key] += prev_value
            pl_prev_count[prev_cum_key] += 1

            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年累計',
                '値': pl_prev_cumulative[prev_cum_key],
            })

            prev_avg = round(pl_prev_cumulative[prev_cum_key] / pl_prev_count[prev_cum_key], 1)
            combined_data.append({
                '年月': yearmonth,
                '部門': store_name,
                '店舗コード': store_code,
                '大項目': big_category,
                '中項目': item,
                '単位': unit,
                '区分': '前年平均',
                '値': prev_avg,
            })

            # 前年比（%）
            if prev_value != 0 and value is not None:
                yoy_ratio = round((value / prev_value) * 100, 1)
                combined_data.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': big_category,
                    '中項目': item,
                    '単位': '%',
                    '区分': '前年比',
                    '値': yoy_ratio,
                })

            # 前年売上比（%）- PLの利益・費用項目（月次）
            prev_sales = prev_sales_by_store_month.get(sales_key)
            if prev_sales and prev_sales != 0 and prev_value is not None:
                prev_ratio = round((prev_value / prev_sales) * 100, 1)
                combined_data.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': big_category,
                    '中項目': item,
                    '単位': '%',
                    '区分': '前年売上比',
                    '値': prev_ratio,
                })

            # 前年売上比累計（%）- PLの利益・費用項目（累計ベース）
            # 事前計算済みの前年売上累計を使用
            prev_sales_cum_key = (fiscal_year, store_code, yearmonth)
            prev_cum_sales = prev_sales_cumulative.get(prev_sales_cum_key, 0)
            if prev_cum_sales and prev_cum_sales != 0 and pl_prev_cumulative[prev_cum_key] != 0:
                prev_cum_ratio = round((pl_prev_cumulative[prev_cum_key] / prev_cum_sales) * 100, 1)
                combined_data.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': big_category,
                    '中項目': item,
                    '単位': '%',
                    '区分': '前年売上比累計',
                    '値': prev_cum_ratio,
                })

    # ========== 統合売上高（PL優先→POSフォールバック）==========
    # PLの純売上高がない月はPOSの純売上高で補完

    # PLの純売上高をインデックス化
    pl_sales_index = {}
    for r in combined_data:
        if r['大項目'] == 'PL_売上高' and r['中項目'] == '純売上高':
            key = (r['年月'], r['店舗コード'], r['区分'])
            pl_sales_index[key] = r['値']

    # POSの純売上高をインデックス化
    pos_sales_index = {}
    for r in combined_data:
        if r['大項目'] == 'POS_売上' and r['中項目'] == '純売上高':
            key = (r['年月'], r['店舗コード'], r['区分'])
            pos_sales_index[key] = r['値']

    # 統合売上高を生成（PL優先、なければPOS）
    integrated_sales = []
    all_keys = set(pl_sales_index.keys()) | set(pos_sales_index.keys())

    for key in all_keys:
        yearmonth, store_code, kubun = key
        store_name = store_names.get(store_code, store_code)

        # PL優先
        if key in pl_sales_index and pl_sales_index[key] is not None:
            value = pl_sales_index[key]
            source = 'PL'
        elif key in pos_sales_index and pos_sales_index[key] is not None:
            value = pos_sales_index[key]
            source = 'POS'
        else:
            continue

        integrated_sales.append({
            '年月': yearmonth,
            '部門': store_name,
            '店舗コード': store_code,
            '大項目': '統合_売上',
            '中項目': '純売上高',
            '単位': '円' if kubun not in ['前年比', '売上比', '前年売上比', '計画比'] else '%',
            '区分': kubun,
            '値': value,
        })

    combined_data.extend(integrated_sales)
    print(f"統合売上高レコード: {len(integrated_sales)}")

    # ========== FL / FLR 比率計算 ==========
    # FL = (Food原価 + Labor人件費) / 売上 × 100
    # FLR = (Food原価 + Labor人件費 + Rent家賃) / 売上 × 100

    # PLデータをインデックス化（年月, 店舗コード, 中項目, 区分）
    pl_values = {}
    for r in combined_data:
        if r['大項目'].startswith('PL_'):
            key = (r['年月'], r['店舗コード'], r['中項目'], r['区分'])
            pl_values[key] = r['値']

    # FL/FLR計算に必要な項目
    food_items = ['当期売上原価', '飲食店原価合計']
    labor_items = ['人件費合計']
    rent_items = ['店舗家賃']
    sales_items = ['純売上高']

    # 年月×店舗の組み合わせを取得
    yearmonth_stores = set()
    for r in combined_data:
        if r['大項目'].startswith('PL_'):
            yearmonth_stores.add((r['年月'], r['店舗コード'], store_names.get(r['店舗コード'], r['店舗コード'])))

    fl_records = []
    for yearmonth, store_code, store_name in sorted(yearmonth_stores):
        for kubun in ['実績', '実績累計']:
            # 各項目の値を取得
            def get_value(items):
                for item in items:
                    key = (yearmonth, store_code, item, kubun)
                    if key in pl_values and pl_values[key] is not None:
                        return pl_values[key]
                return None

            food = get_value(food_items)
            labor = get_value(labor_items)
            rent = get_value(rent_items)
            sales = get_value(sales_items)

            # FL比計算
            if food is not None and labor is not None and sales and sales != 0:
                fl_ratio = round(((food + labor) / sales) * 100, 1)
                fl_records.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': 'POS_効率',
                    '中項目': 'FL比',
                    '単位': '%',
                    '区分': kubun,
                    '値': fl_ratio,
                })

            # FLR比計算
            if food is not None and labor is not None and rent is not None and sales and sales != 0:
                flr_ratio = round(((food + labor + rent) / sales) * 100, 1)
                fl_records.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': 'POS_効率',
                    '中項目': 'FLR比',
                    '単位': '%',
                    '区分': kubun,
                    '値': flr_ratio,
                })

    combined_data.extend(fl_records)
    print(f"FL/FLRレコード: {len(fl_records)}")

    # ========== 粗利率・営業利益率 計算 ==========
    # 粗利率 = 売上総利益 ÷ 純売上高 × 100
    # 営業利益率 = 営業利益(損失) ÷ 純売上高 × 100
    gross_profit_items = ['売上総利益']
    operating_profit_items = ['営業利益(損失)', '営業利益']

    ratio_records = []
    for yearmonth, store_code, store_name in sorted(yearmonth_stores):
        for kubun in ['実績', '実績累計']:
            def get_val(items):
                for item in items:
                    key = (yearmonth, store_code, item, kubun)
                    if key in pl_values and pl_values[key] is not None:
                        return pl_values[key]
                return None

            sales = get_val(sales_items)
            gross_profit = get_val(gross_profit_items)
            operating_profit = get_val(operating_profit_items)

            # 粗利率
            if gross_profit is not None and sales and sales != 0:
                gross_ratio = round((gross_profit / sales) * 100, 1)
                ratio_records.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': 'POS_効率',
                    '中項目': '粗利率',
                    '単位': '%',
                    '区分': kubun,
                    '値': gross_ratio,
                })

            # 営業利益率
            if operating_profit is not None and sales and sales != 0:
                op_ratio = round((operating_profit / sales) * 100, 1)
                ratio_records.append({
                    '年月': yearmonth,
                    '部門': store_name,
                    '店舗コード': store_code,
                    '大項目': 'POS_効率',
                    '中項目': '営業利益率',
                    '単位': '%',
                    '区分': kubun,
                    '値': op_ratio,
                })

    combined_data.extend(ratio_records)
    print(f"粗利率・営業利益率レコード: {len(ratio_records)}")

    # ========== 曜日別データの統合 ==========
    weekday_records = create_weekday_records(store_names)
    combined_data.extend(weekday_records)
    print(f"曜日別データ: {len(weekday_records)}件")

    # 部門リストを生成
    departments = sorted(set(r['部門'] for r in combined_data if r['部門']))

    # master_data形式で出力
    master_data = {
        'company_name': '株式会社ジュネストリー',
        'format': 'long',
        'generated_at': datetime.now().isoformat(),
        'columns': ['年月', '部門', '店舗コード', '大項目', '中項目', '単位', '区分', '値'],
        'departments': departments,
        'total_records': len(combined_data),
        'data': combined_data,
    }

    return master_data

def upload_to_drive(service, filepath, filename, folder_id):
    """Google Driveにresumable uploadでアップロード（大容量ファイル対応）"""
    from googleapiclient.http import MediaFileUpload
    import time

    # ファイルサイズ確認
    file_size = os.path.getsize(filepath)
    print(f'ファイルサイズ: {file_size / 1024 / 1024:.1f} MB')

    # 既存ファイルを検索
    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    results = service.files().list(
        q=query,
        fields='files(id)',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()
    existing = results.get('files', [])

    # Resumable upload（大容量ファイル対応）
    media = MediaFileUpload(filepath, mimetype='application/json', resumable=True)

    if existing:
        file_id = existing[0]['id']
        request = service.files().update(
            fileId=file_id,
            media_body=media,
            supportsAllDrives=True
        )
    else:
        file_metadata = {'name': filename, 'parents': [folder_id]}
        request = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        )

    # チャンク単位でアップロード（リトライ付き）
    response = None
    retries = 0
    max_retries = 3

    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                print(f'  進捗: {int(status.progress() * 100)}%')
            retries = 0  # 成功したらリトライカウントをリセット
        except Exception as e:
            retries += 1
            if retries > max_retries:
                print(f'アップロード失敗（{max_retries}回リトライ後）: {e}')
                raise
            print(f'  リトライ {retries}/{max_retries}...')
            time.sleep(2 ** retries)  # 指数バックオフ

    print(f'{"更新" if existing else "作成"}: {filename}')

def upload_small_json(service, data, filename, folder_id, max_retries=5):
    """小さいJSONをメモリからアップロード（リトライ付き、レート制限対応）"""
    import time
    from googleapiclient.http import MediaInMemoryUpload

    content = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

    retries = 0
    while True:
        try:
            # ファイル検索もリトライ対象に含める
            query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
            results = service.files().list(
                q=query, fields='files(id)',
                supportsAllDrives=True, includeItemsFromAllDrives=True
            ).execute()
            existing = results.get('files', [])

            media = MediaInMemoryUpload(content, mimetype='application/json')
            if existing:
                service.files().update(fileId=existing[0]['id'], media_body=media, supportsAllDrives=True).execute()
            else:
                file_metadata = {'name': filename, 'parents': [folder_id]}
                service.files().create(body=file_metadata, media_body=media, fields='id', supportsAllDrives=True).execute()

            # レート制限回避のため少し待機
            time.sleep(0.3)
            return
        except Exception as e:
            retries += 1
            if retries > max_retries:
                print(f'  アップロード失敗（{max_retries}回リトライ後）: {e}')
                raise
            wait_time = min(2 ** retries, 30)  # 最大30秒
            print(f'  リトライ {retries}/{max_retries}... ({wait_time}秒待機)')
            time.sleep(wait_time)


def is_new_store(opened_at: str, fiscal_year: str) -> bool:
    """今期の新店かどうかを判定（11月始まり）"""
    if not opened_at:
        return False
    try:
        opened = datetime.strptime(opened_at, '%Y-%m-%d')
        fy = int(fiscal_year)
        # 今期: (fy-1)年11月 ～ fy年10月
        fy_start = datetime(fy - 1, 11, 1)
        fy_end = datetime(fy, 10, 31)
        return fy_start <= opened <= fy_end
    except:
        return False


def main():
    print("========== master_data.json 作成開始 ==========\n")

    # 環境設定
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    env_path = project_dir / '.env.local'

    if env_path.exists():
        setup_google_auth(str(env_path))

    # master_data作成
    master_data = create_master_data()
    print(f"統合レコード数: {master_data['total_records']}")
    print(f"部門数: {len(master_data['departments'])}")

    # 区分の内訳を表示
    kubun_counts = defaultdict(int)
    for r in master_data['data']:
        kubun_counts[r['区分']] += 1
    print("\n区分別レコード数:")
    for k in ['実績', '実績平均', '実績累計', '前年', '前年平均', '前年累計', '前年比', '売上比', '売上比累計', '前年売上比', '前年売上比累計']:
        if k in kubun_counts:
            print(f"  {k}: {kubun_counts[k]:,}")

    # ========== 店舗マスター読み込み（Google Drive優先）==========
    drive_master = get_store_master_from_drive()
    if drive_master and drive_master.get('stores'):
        store_info = drive_master['stores']
    else:
        stores_master = load_json(script_dir / 'junestory_stores.json')
        store_info = {s['store_code']: s for s in stores_master.get('stores', [])}

    # 今期の年度（最新データから判定）
    latest_yearmonth = max(r['年月'] for r in master_data['data'] if r.get('年月'))
    current_fy = get_fiscal_year(latest_yearmonth)
    print(f"今期: {current_fy}年10月期")

    # ========== 分割用のグループ作成 ==========
    output_dir = project_dir / 'data' / 'junestory' / 'split'
    output_dir.mkdir(parents=True, exist_ok=True)

    # 各グループ用のデータ
    by_store = defaultdict(list)      # 店舗別
    by_brand = defaultdict(list)      # 業態別
    by_status = defaultdict(list)     # 新店/既存店別

    for r in master_data['data']:
        raw_code = r.get('店舗コード') or 'unknown'
        store_code = normalize_store_code(raw_code)
        # レコードの店舗コードも更新（ファイル内データも正規化）
        r['店舗コード'] = store_code
        info = store_info.get(store_code, {})

        # 店舗別
        by_store[store_code].append(r)

        # 業態別
        brand = info.get('brand', 'other')
        by_brand[brand].append(r)

        # 新店/既存店別
        opened_at = info.get('opened_at')
        if is_new_store(opened_at, current_fy):
            by_status['new'].append(r)
        else:
            by_status['existing'].append(r)

    # ========== ファイル保存 ==========
    all_files = []

    # 1. 店舗別ファイル（付帯情報を含む）
    print(f"\n[店舗別] {len(by_store)}店舗")
    for store_code, records in sorted(by_store.items()):
        info = store_info.get(store_code, {})
        filename = f"store_{store_code}.json"
        filepath = output_dir / filename
        file_data = {
            'type': 'store',
            'store_code': store_code,
            'store_name': info.get('name', store_code),
            'brand': info.get('brand'),
            'brand_name': info.get('brand_name', info.get('brand', '')),
            # 付帯情報
            'tsubo': info.get('tsubo'),
            'seats': info.get('seats'),
            'rent': info.get('rent'),
            'opened_at': info.get('opened_at'),
            'record_count': len(records),
            'data': records
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(file_data, f, ensure_ascii=False, separators=(',', ':'))
        all_files.append({'type': 'store', 'key': store_code, 'filename': filename, 'records': len(records)})

    # 2. 業態別ファイル
    brand_names = {'kintaro': '均タロー', 'toriyaro': '鶏ヤロー', 'kintaro_single': 'きんたろう', 'uoemon': '魚ゑもん', 'other': 'その他'}
    print(f"\n[業態別] {len(by_brand)}業態")
    for brand, records in sorted(by_brand.items()):
        filename = f"brand_{brand}.json"
        filepath = output_dir / filename
        file_data = {
            'type': 'brand',
            'brand': brand,
            'brand_name': brand_names.get(brand, brand),
            'record_count': len(records),
            'data': records
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(file_data, f, ensure_ascii=False, separators=(',', ':'))
        all_files.append({'type': 'brand', 'key': brand, 'filename': filename, 'records': len(records)})
        print(f"  {brand_names.get(brand, brand)}: {len(records):,}件")

    # 3. 新店/既存店別ファイル
    status_names = {'new': '新店', 'existing': '既存店'}
    print(f"\n[新店/既存店別]")
    for status, records in sorted(by_status.items()):
        filename = f"status_{status}.json"
        filepath = output_dir / filename
        file_data = {
            'type': 'status',
            'status': status,
            'status_name': status_names.get(status, status),
            'fiscal_year': current_fy,
            'record_count': len(records),
            'data': records
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(file_data, f, ensure_ascii=False, separators=(',', ':'))
        all_files.append({'type': 'status', 'key': status, 'filename': filename, 'records': len(records)})
        print(f"  {status_names.get(status, status)}: {len(records):,}件")

    # 4. インデックスファイル（付帯情報を含む）
    stores_list = []
    for code, info in store_info.items():
        stores_list.append({
            'code': code,
            'name': info.get('name', ''),
            'brand': info.get('brand', ''),
            'tsubo': info.get('tsubo'),
            'seats': info.get('seats'),
            'rent': info.get('rent'),
            'opened_at': info.get('opened_at'),
        })

    index_data = {
        'generated_at': master_data['generated_at'],
        'company_name': master_data['company_name'],
        'fiscal_year': current_fy,
        'total_records': master_data['total_records'],
        'files': all_files,
        'stores': stores_list,
        'brands': list(brand_names.items()),
    }
    index_path = output_dir / 'index.json'
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)

    # 5. 統合master_data.json（API用）
    master_data_path = project_dir / 'data' / 'junestory' / 'junestory_master_data.json'
    with open(master_data_path, 'w', encoding='utf-8') as f:
        json.dump(master_data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"\nローカルmaster_data更新: {master_data_path}")

    print(f"\n保存先: {output_dir}")
    print(f"ファイル数: {len(all_files) + 1}")

    # Google Driveアップロード
    service = get_drive_service()
    if service:
        print("\nGoogle Driveにアップロード中...")

        # master_data.jsonをアップロード（APIが参照するメインファイル）
        print(f"  junestory_master_data.json (大容量ファイル)...")
        upload_to_drive(service, str(master_data_path), 'junestory_master_data.json', JUNESTORY_FOLDER_ID)

        # インデックスファイルをアップロード
        upload_small_json(service, index_data, 'index.json', JUNESTORY_FOLDER_ID)
        print(f"  index.json")

        # 各ファイルをアップロード
        for i, f_info in enumerate(all_files):
            filepath = output_dir / f_info['filename']
            with open(filepath, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
            upload_small_json(service, file_data, f_info['filename'], JUNESTORY_FOLDER_ID)
            print(f"  [{i+1}/{len(all_files)}] {f_info['filename']}")

        print(f"\nフォルダURL: https://drive.google.com/drive/folders/{JUNESTORY_FOLDER_ID}")
    else:
        print("\n[WARN] Google Drive APIが利用できません")

    print("\n========== 完了 ==========")

if __name__ == '__main__':
    main()

    # 次のスクリプトを自動実行
    print("\n" + "=" * 50)
    print("続けて 店舗指標計算を実行...")
    print("=" * 50 + "\n")
    from calc_store_metrics import main as metrics_main
    metrics_main()
