"""
店舗指標を計算（縦持ち、月次・年度累計）

計算指標:
- 家賃比率 = 家賃 / 売上
- 席回転率 = 客数 / 席数 / 営業日数
- 坪売上 = 売上 / 坪数
- 費用比率 = 各費用 / 売上

会計期間: 11月〜10月
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from dateutil import parser as date_parser

sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import setup_google_auth, get_drive_service

JUNESTORY_FOLDER_ID = '1Bt8WpIQWUiHiOCct_c1AikDOZ5CKprCL'
STORE_MANAGEMENT_FILE_ID = '1o8mLajjm8FOKVeJc2a-qaGNBMRCF0NDu'

# 会計期間の開始月（11月）
FISCAL_YEAR_START_MONTH = 11


def check_and_update_store_master(service):
    """店舗管理表の更新日時をチェックし、必要なら店舗マスタを更新"""
    script_dir = Path(__file__).parent
    stores_file = script_dir / 'junestory_stores.json'

    # 現在の店舗マスタの更新日時を取得
    local_updated_at = None
    if stores_file.exists():
        with open(stores_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            local_updated_at = data.get('store_master_updated_at')

    # スプレッドシートの更新日時を取得
    try:
        file_info = service.files().get(
            fileId=STORE_MANAGEMENT_FILE_ID,
            fields='modifiedTime',
            supportsAllDrives=True
        ).execute()
        remote_modified = file_info.get('modifiedTime')
    except Exception as e:
        print(f"[WARN] Could not check spreadsheet: {e}")
        return

    # 比較
    need_update = False
    if not local_updated_at:
        print("[INFO] Store master not found, will update...")
        need_update = True
    else:
        local_dt = date_parser.parse(local_updated_at)
        remote_dt = date_parser.parse(remote_modified)

        # タイムゾーンを揃える（両方ともUTCに）
        if local_dt.tzinfo is None:
            local_dt = local_dt.replace(tzinfo=remote_dt.tzinfo)

        if remote_dt > local_dt:
            print(f"[INFO] Spreadsheet updated: {remote_modified}")
            print(f"       Local version: {local_updated_at}")
            print("       Updating store master...")
            need_update = True
        else:
            print("[INFO] Store master is up to date")

    if need_update:
        from update_store_master import main as update_main
        update_main()


def get_fiscal_year(year_month):
    """年月から会計年度を取得（11月〜10月）"""
    year, month = map(int, year_month.split('-'))
    if month >= FISCAL_YEAR_START_MONTH:
        return year + 1  # 11月以降は翌年度
    return year


def get_fiscal_months_order(year_month):
    """会計年度内での月の順番（11月=1, 12月=2, ... 10月=12）"""
    _, month = map(int, year_month.split('-'))
    if month >= FISCAL_YEAR_START_MONTH:
        return month - FISCAL_YEAR_START_MONTH + 1
    return month + (12 - FISCAL_YEAR_START_MONTH + 1)


def load_json_from_drive(service, folder_id, filename):
    """Google DriveからJSONファイルを読み込み"""
    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    results = service.files().list(
        q=query,
        fields='files(id)',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()
    files = results.get('files', [])

    if not files:
        return None

    file_id = files[0]['id']
    content = service.files().get_media(
        fileId=file_id,
        supportsAllDrives=True
    ).execute()

    return json.loads(content.decode('utf-8'))


def upload_to_drive(service, data, filename, folder_id):
    """Google Driveにアップロード"""
    from googleapiclient.http import MediaInMemoryUpload

    content = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')

    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    results = service.files().list(
        q=query,
        fields='files(id)',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()
    existing = results.get('files', [])

    media = MediaInMemoryUpload(content, mimetype='application/json')

    if existing:
        file_id = existing[0]['id']
        service.files().update(
            fileId=file_id,
            media_body=media,
            supportsAllDrives=True
        ).execute()
        print(f'  Updated: {filename}')
    else:
        file_metadata = {'name': filename, 'parents': [folder_id]}
        service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f'  Created: {filename}')


def calc_metrics():
    """指標を計算"""
    script_dir = Path(__file__).parent

    # 店舗マスタ読み込み
    with open(script_dir / 'junestory_stores.json', 'r', encoding='utf-8') as f:
        stores_data = json.load(f)

    store_master = {s['store_code']: s for s in stores_data['stores']}

    # Google Drive APIサービス取得
    service = get_drive_service()
    if not service:
        print("[ERROR] Google Drive API unavailable")
        return None

    # データ読み込み
    print("Loading POS data...")
    pos_data = load_json_from_drive(service, JUNESTORY_FOLDER_ID, 'pos_data.json')
    print("Loading PL data...")
    pl_data = load_json_from_drive(service, JUNESTORY_FOLDER_ID, 'pl_data.json')

    if not pos_data or not pl_data:
        print("[ERROR] Data not found")
        return None

    # POSデータを店舗×月ごとに集計
    print("Aggregating POS data...")
    pos_agg = {}  # { "store_code|year_month": { sales, customers } }

    for rec in pos_data.get('data', []):
        key = f"{rec['店舗コード']}|{rec['年月']}"
        if key not in pos_agg:
            pos_agg[key] = {
                'store_code': rec['店舗コード'],
                'store_name': rec['店舗名'],
                'year_month': rec['年月'],
                'sales': 0,
                'customers': 0,
            }

        if rec.get('中項目') == '純売上高(税抜)':
            pos_agg[key]['sales'] = rec.get('値', 0)
        if rec.get('中項目') == '客数':
            pos_agg[key]['customers'] = rec.get('値', 0)

    # PLデータから売上を取得（店舗×月）
    print("Aggregating PL sales...")
    pl_sales = {}
    for rec in pl_data.get('data', []):
        if rec.get('大項目') == '売上高' and rec.get('中項目') == '純売上高':
            key = f"{rec['店舗コード']}|{rec['年月']}"
            pl_sales[key] = rec.get('値', 0)

    # 指標計算
    print("Calculating metrics...")
    metrics = []
    DAYS_IN_MONTH = 25  # 月の営業日数（仮定）

    # --- POS指標（家賃比率、席回転率、坪売上）---
    for data in pos_agg.values():
        store = store_master.get(data['store_code'])
        if not store:
            continue

        base_info = {
            'year_month': data['year_month'],
            'store_code': data['store_code'],
            'store_name': data['store_name'],
            'brand': store.get('brand_name', ''),
            'category': store.get('category', ''),
            'fiscal_year': get_fiscal_year(data['year_month']),
            'period_type': 'monthly',
        }

        # 家賃比率
        if store.get('rent') and data['sales'] > 0:
            metrics.append({
                **base_info,
                'metric': 'rent_ratio',
                'metric_name': '家賃比率',
                'value': round(store['rent'] / data['sales'] * 100, 1),
                'unit': '%',
            })

        # 席回転率
        if store.get('seats') and data['customers'] > 0:
            metrics.append({
                **base_info,
                'metric': 'seat_turnover',
                'metric_name': '席回転率',
                'value': round(data['customers'] / store['seats'] / DAYS_IN_MONTH, 2),
                'unit': 'times/day',
            })

        # 坪売上
        if store.get('tsubo') and data['sales'] > 0:
            metrics.append({
                **base_info,
                'metric': 'sales_per_tsubo',
                'metric_name': '坪売上',
                'value': round(data['sales'] / store['tsubo']),
                'unit': 'yen',
            })

    # --- PL指標（費用比率）---
    expense_categories = ['売上原価', '販管費']
    for rec in pl_data.get('data', []):
        if rec.get('大項目') not in expense_categories:
            continue
        if '合計' in str(rec.get('中項目', '')):
            continue

        key = f"{rec['店舗コード']}|{rec['年月']}"
        sales = pl_sales.get(key, 0)
        if sales <= 0:
            continue

        store = store_master.get(rec['店舗コード'])
        if not store:
            continue

        expense_value = rec.get('値', 0)
        if expense_value == 0:
            continue

        metrics.append({
            'year_month': rec['年月'],
            'store_code': rec['店舗コード'],
            'store_name': rec['店舗名'],
            'brand': store.get('brand_name', ''),
            'category': store.get('category', ''),
            'fiscal_year': get_fiscal_year(rec['年月']),
            'period_type': 'monthly',
            'metric': f"expense_ratio_{rec['大項目']}_{rec['中項目']}",
            'metric_name': f"費用比率_{rec['大項目']}_{rec['中項目']}",
            'value': round(expense_value / sales * 100, 1),
            'unit': '%',
        })

    # --- 年度累計計算 ---
    print("Calculating YTD...")
    cumulative = {}  # { "fiscal_year|store_code|metric": [values] }

    for m in metrics:
        if m['period_type'] != 'monthly':
            continue
        key = f"{m['fiscal_year']}|{m['store_code']}|{m['metric']}"
        if key not in cumulative:
            cumulative[key] = {
                'values': [],
                'template': m,
            }
        cumulative[key]['values'].append({
            'year_month': m['year_month'],
            'value': m['value'],
        })

    # 累計レコードを追加
    for key, data in cumulative.items():
        if len(data['values']) < 2:
            continue

        # 年月でソート
        data['values'].sort(key=lambda x: x['year_month'])
        avg_value = sum(v['value'] for v in data['values']) / len(data['values'])
        last_month = data['values'][-1]['year_month']

        template = data['template']
        metrics.append({
            **template,
            'year_month': f"YTD_{template['fiscal_year']}",
            'period_type': 'ytd',
            'value': round(avg_value, 2),
            'ytd_months': len(data['values']),
            'ytd_last_month': last_month,
        })

    return {
        'company_name': stores_data['company_name'],
        'generated_at': datetime.now().isoformat(),
        'fiscal_year_start_month': FISCAL_YEAR_START_MONTH,
        'total_records': len(metrics),
        'metrics': ['rent_ratio', 'seat_turnover', 'sales_per_tsubo', 'expense_ratio_*'],
        'data': metrics,
    }


def main():
    print("========== Store Metrics Calculation ==========\n")

    # 環境設定
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    env_path = project_dir / '.env.local'

    if env_path.exists():
        setup_google_auth(str(env_path))

    # 店舗マスタの更新チェック
    print("Checking store master...")
    service = get_drive_service()
    if service:
        check_and_update_store_master(service)
    print("")

    # 指標計算
    result = calc_metrics()
    if not result:
        return

    print(f"\nTotal records: {result['total_records']}")

    # 指標別集計
    metric_counts = {}
    for m in result['data']:
        metric = m['metric'].split('_')[0] if 'expense_ratio' in m['metric'] else m['metric']
        metric_counts[metric] = metric_counts.get(metric, 0) + 1

    print("\nMetrics breakdown:")
    for k, v in sorted(metric_counts.items()):
        print(f"  {k}: {v}")

    # ローカル保存
    output_path = project_dir / 'data' / 'junestory' / 'store_metrics.json'
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nLocal save: {output_path}")

    # Google Driveアップロード
    service = get_drive_service()
    if service:
        print("\nUploading to Google Drive...")
        upload_to_drive(service, result, 'store_metrics.json', JUNESTORY_FOLDER_ID)
    else:
        print("\n[WARN] Google Drive API unavailable")

    print("\n========== Done ==========")


if __name__ == '__main__':
    main()
