"""
Excel報告書を1社1DBの縦持ち形式に変換する共通ライブラリ

出力形式:
年月, 部門, 大項目, 中項目, 単位, 区分, 値

区分: 実績, 計画, 実績累計, 計画累計
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import json
import os
import base64
from io import BytesIO

# Google Drive API（オプション）
try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False
    print('[INFO] google-api-python-client未インストール。ローカル保存のみ利用可能')


def load_env_from_file(env_path: str):
    """環境変数を.envファイルから読み込む"""
    if not Path(env_path).exists():
        return

    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                value = value.strip()
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                value = value.replace('\\n', '\n')
                os.environ[key] = value


def setup_google_auth(env_path: str):
    """Google認証をセットアップ"""
    load_env_from_file(env_path)

    # GOOGLE_PRIVATE_KEYをBase64形式に変換
    private_key = os.environ.get('GOOGLE_PRIVATE_KEY')
    if private_key and not os.environ.get('GOOGLE_PRIVATE_KEY_BASE64'):
        os.environ['GOOGLE_PRIVATE_KEY_BASE64'] = base64.b64encode(private_key.encode()).decode()


def get_drive_service():
    """Google Drive APIサービスを取得"""
    if not GOOGLE_API_AVAILABLE:
        return None

    email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    private_key_b64 = os.environ.get('GOOGLE_PRIVATE_KEY_BASE64')

    if not email or not private_key_b64:
        print('[WARN] Google API認証情報が設定されていません')
        return None

    try:
        private_key = base64.b64decode(private_key_b64).decode('utf-8')

        credentials_info = {
            "type": "service_account",
            "project_id": "pdca-dashboard",
            "private_key": private_key,
            "client_email": email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }

        credentials = service_account.Credentials.from_service_account_info(
            credentials_info,
            scopes=['https://www.googleapis.com/auth/drive']
        )

        return build('drive', 'v3', credentials=credentials)
    except Exception as e:
        print(f'[ERROR] Google Drive API初期化失敗: {e}')
        return None


def upload_to_drive(service, file_content: bytes, filename: str, folder_id: str, mime_type: str) -> str:
    """ファイルをGoogle Driveにアップロード（既存ファイルは上書き）"""
    if not service:
        return None

    try:
        query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        results = service.files().list(q=query, fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        existing_files = results.get('files', [])

        media = MediaIoBaseUpload(BytesIO(file_content), mimetype=mime_type, resumable=True)

        if existing_files:
            file_id = existing_files[0]['id']
            file = service.files().update(
                fileId=file_id,
                media_body=media,
                supportsAllDrives=True
            ).execute()
            print(f'  -> Drive更新: {filename} (ID: {file_id})')
        else:
            file_metadata = {
                'name': filename,
                'parents': [folder_id]
            }
            file = service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id',
                supportsAllDrives=True
            ).execute()
            print(f'  -> Driveアップロード: {filename} (ID: {file.get("id")})')

        return file.get('id')
    except Exception as e:
        print(f'[ERROR] アップロード失敗 ({filename}): {e}')
        return None


def find_folder_by_name(service, folder_name: str, parent_id: str) -> str:
    """親フォルダ内でフォルダ名を検索してIDを返す"""
    if not service:
        return None

    try:
        query = f"name='{folder_name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(
            q=query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        files = results.get('files', [])

        if files:
            return files[0]['id']
        return None
    except Exception as e:
        print(f'[ERROR] フォルダ検索失敗 ({folder_name}): {e}')
        return None


def convert_shukuhaku_sheet(df: pd.DataFrame) -> list[dict]:
    """宿泊シートを縦持ち形式に変換"""
    records = []

    months_first = ['4月', '5月', '6月', '7月', '8月', '9月']
    months_second = ['10月', '11月', '12月', '1月', '2月', '3月']

    def month_to_yearmonth(month_str: str) -> str:
        month_num = int(month_str.replace('月', ''))
        year = 2025 if month_num >= 4 else 2026
        return f"{year}-{month_num:02d}"

    def get_unit(item: str, category: str) -> str:
        if 'OCC' in str(item) or '率' in str(item) or '率' in str(category):
            return '%'
        if 'ADR' in str(item) or 'RevPAR' in str(item) or '売上' in str(item) or '室料' in str(item) or '食事料' in str(category):
            return '円'
        if '客数' in str(item) or '定員' in str(item) or 'DOR' in str(item) or '人員' in str(category):
            return '人'
        if '部屋数' in str(item) or '客室数' in str(item):
            return '室'
        if '日数' in str(category):
            return '日'
        if '出数' in str(category):
            return '食'
        return ''

    def get_category(item: str) -> str:
        if item in ['営業状況']:
            return '営業状況'
        if item in ['宿泊客数']:
            return '宿泊客数'
        if item in ['宿泊室料', '（奉仕料込）']:
            return '売上'
        if item in ['使用客室数', 'OCC（客室稼働率）', '定員稼働率', 'ADR（宿泊料/使用客室数）',
                    'RevPAR(OCC*ADR)', 'DOR（1室当り人員）']:
            return 'KPI'
        if item in ['朝食', '夕食', '朝食食事', '朝食食事料', '夕食食事', '夕食食事料']:
            return '食事'
        if item in ['一人当り売上']:
            return 'KPI'
        return 'その他'

    def extract_data(row_start, row_end, months, half):
        data = []
        for row_idx in range(row_start, row_end):
            row = df.iloc[row_idx]

            main_item = row[0] if pd.notna(row[0]) else None
            sub_item = row[1] if pd.notna(row[1]) else None
            unit_cell = row[2] if pd.notna(row[2]) else None

            if main_item is None:
                for prev_idx in range(row_idx - 1, row_start - 1, -1):
                    prev_main = df.iloc[prev_idx, 0]
                    if pd.notna(prev_main):
                        main_item = prev_main
                        break

            if main_item in ['令和7年度　宿泊', '対7年度計画比較']:
                continue

            middle_item = sub_item if sub_item else main_item
            unit = str(unit_cell) if unit_cell else get_unit(str(main_item), str(middle_item))
            big_category = get_category(str(main_item))

            col_idx = 3
            for month in months:
                actual = row[col_idx] if col_idx < len(row) and pd.notna(row[col_idx]) else None
                plan = row[col_idx + 1] if col_idx + 1 < len(row) and pd.notna(row[col_idx + 1]) else None

                if actual is not None and not isinstance(actual, str):
                    yearmonth = month_to_yearmonth(month)

                    data.append({
                        '年月': yearmonth,
                        '部門': '宿泊',
                        '大項目': big_category,
                        '中項目': middle_item,
                        '単位': unit,
                        '区分': '実績',
                        '値': float(actual)
                    })

                    if plan is not None and not isinstance(plan, str):
                        data.append({
                            '年月': yearmonth,
                            '部門': '宿泊',
                            '大項目': big_category,
                            '中項目': middle_item,
                            '単位': unit,
                            '区分': '計画',
                            '値': float(plan)
                        })

                col_idx += 3
        return data

    records.extend(extract_data(2, 24, months_first, '上半期'))
    records.extend(extract_data(25, 47, months_second, '下半期'))

    return records


def calculate_cumulative(records: list[dict]) -> list[dict]:
    """累計を計算して追加（比率系KPIは除外）"""
    df = pd.DataFrame(records)

    ratio_kpis = ['OCC', 'ADR', 'DOR', 'RevPAR', '定員稼働率', '稼働率']

    def is_ratio_kpi(middle_item: str) -> bool:
        return any(kpi in str(middle_item) for kpi in ratio_kpis)

    month_order = {
        '2025-04': 0, '2025-05': 1, '2025-06': 2, '2025-07': 3, '2025-08': 4, '2025-09': 5,
        '2025-10': 6, '2025-11': 7, '2025-12': 8, '2026-01': 9, '2026-02': 10, '2026-03': 11
    }
    df['月順'] = df['年月'].map(month_order)
    df = df.sort_values(['部門', '大項目', '中項目', '区分', '月順'])

    cumulative_records = []

    for (dept, big, mid, kubun), group in df.groupby(['部門', '大項目', '中項目', '区分'], sort=False):
        if kubun not in ['実績', '計画']:
            continue

        if is_ratio_kpi(mid):
            continue

        group = group.sort_values('月順')
        cumsum = 0

        for _, row in group.iterrows():
            cumsum += row['値']
            cumulative_records.append({
                '年月': row['年月'],
                '部門': dept,
                '大項目': big,
                '中項目': mid,
                '単位': row['単位'],
                '区分': f"{kubun}累計",
                '値': cumsum
            })

    return records + cumulative_records


def calculate_ratio_kpi_cumulative(records: list[dict]) -> list[dict]:
    """比率系KPIの累計を正しく計算（加重平均ベース）"""
    df = pd.DataFrame(records)

    months_sorted = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09',
                     '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']

    kpi_records = []

    for kubun in ['実績', '計画']:
        kubun_df = df[df['区分'] == kubun]
        kubun_cum_df = df[df['区分'] == f'{kubun}累計']

        def get_cum_value(yearmonth: str, middle_item: str) -> float:
            rows = kubun_cum_df[(kubun_cum_df['年月'] == yearmonth) &
                                (kubun_cum_df['中項目'].str.contains(middle_item, na=False))]
            if len(rows) > 0:
                return rows['値'].values[0]
            return None

        for yearmonth in months_sorted:
            rooms_available_cum = get_cum_value(yearmonth, '販売可能')
            rooms_used_cum = get_cum_value(yearmonth, '使用客室数')
            guests_cum = None
            room_revenue_cum = None
            capacity_cum = get_cum_value(yearmonth, '定員')

            guest_rows = kubun_cum_df[(kubun_cum_df['年月'] == yearmonth) &
                                       (kubun_cum_df['中項目'] == '計') &
                                       (kubun_cum_df['大項目'] == '宿泊客数')]
            if len(guest_rows) > 0:
                guests_cum = guest_rows['値'].values[0]

            revenue_rows = kubun_cum_df[(kubun_cum_df['年月'] == yearmonth) &
                                         (kubun_cum_df['中項目'] == '合計') &
                                         (kubun_cum_df['大項目'] == '売上')]
            if len(revenue_rows) > 0:
                room_revenue_cum = revenue_rows['値'].values[0]

            if rooms_used_cum and rooms_available_cum and rooms_available_cum > 0:
                occ_cum = (rooms_used_cum / rooms_available_cum) * 100
                kpi_records.append({
                    '年月': yearmonth, '部門': '宿泊', '大項目': 'KPI',
                    '中項目': 'OCC（客室稼働率）', '単位': '%',
                    '区分': f'{kubun}累計', '値': round(occ_cum, 1)
                })

            if room_revenue_cum and rooms_used_cum and rooms_used_cum > 0:
                adr_cum = room_revenue_cum / rooms_used_cum
                kpi_records.append({
                    '年月': yearmonth, '部門': '宿泊', '大項目': 'KPI',
                    '中項目': 'ADR（宿泊料/使用客室数）', '単位': '円',
                    '区分': f'{kubun}累計', '値': round(adr_cum, 0)
                })

            if room_revenue_cum and rooms_available_cum and rooms_available_cum > 0:
                revpar_cum = room_revenue_cum / rooms_available_cum
                kpi_records.append({
                    '年月': yearmonth, '部門': '宿泊', '大項目': 'KPI',
                    '中項目': 'RevPAR(OCC*ADR)', '単位': '円',
                    '区分': f'{kubun}累計', '値': round(revpar_cum, 0)
                })

            if guests_cum and rooms_used_cum and rooms_used_cum > 0:
                dor_cum = guests_cum / rooms_used_cum
                kpi_records.append({
                    '年月': yearmonth, '部門': '宿泊', '大項目': 'KPI',
                    '中項目': 'DOR（1室当り人員）', '単位': '人',
                    '区分': f'{kubun}累計', '値': round(dor_cum, 2)
                })

            if guests_cum and capacity_cum and capacity_cum > 0:
                cap_rate_cum = (guests_cum / capacity_cum) * 100
                kpi_records.append({
                    '年月': yearmonth, '部門': '宿泊', '大項目': 'KPI',
                    '中項目': '定員稼働率', '単位': '%',
                    '区分': f'{kubun}累計', '値': round(cap_rate_cum, 1)
                })

    return records + kpi_records


def convert_excel_to_master_db(excel_path: str, output_path: str, company_name: str, drive_folder_id: str = None):
    """
    Excel報告書を1社1DBの縦持ち形式に変換

    Args:
        excel_path: Excelファイルパス
        output_path: ローカル出力先
        company_name: 会社名（ファイル名プレフィックス）
        drive_folder_id: Google DriveフォルダID（指定時はDriveにもアップロード）
    """
    excel_path = Path(excel_path)
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f'読み込み: {excel_path}')

    all_records = []

    # 宿泊シート処理
    try:
        df = pd.read_excel(excel_path, sheet_name='現状比較 宿泊', header=None)
        print('宿泊シート処理中...')
        shukuhaku_records = convert_shukuhaku_sheet(df)
        print(f'  -> {len(shukuhaku_records)}件抽出')
        all_records.extend(shukuhaku_records)
    except Exception as e:
        print(f'宿泊シート処理エラー: {e}')

    # 累計計算
    print('累計計算中...')
    all_records = calculate_cumulative(all_records)
    print(f'  -> 数量系累計追加後: {len(all_records)}件')

    # 比率系KPIの累計
    print('比率系KPI累計計算中...')
    all_records = calculate_ratio_kpi_cumulative(all_records)
    print(f'  -> KPI累計追加後: {len(all_records)}件')

    # DataFrame変換
    result_df = pd.DataFrame(all_records)

    # ソート
    month_order = {
        '2025-04': 0, '2025-05': 1, '2025-06': 2, '2025-07': 3, '2025-08': 4, '2025-09': 5,
        '2025-10': 6, '2025-11': 7, '2025-12': 8, '2026-01': 9, '2026-02': 10, '2026-03': 11
    }
    result_df['月順'] = result_df['年月'].map(month_order)
    result_df = result_df.sort_values(['部門', '大項目', '中項目', '区分', '月順'])
    result_df = result_df.drop(columns=['月順'])

    # CSV出力
    csv_path = output_path / f'{company_name}_master_data.csv'
    result_df.to_csv(csv_path, index=False, encoding='utf-8-sig')
    print(f'CSV保存: {csv_path} ({len(result_df)}件)')

    # JSON出力
    json_data = {
        'company_name': company_name,
        'generated_at': datetime.now().isoformat(),
        'format': 'long',
        'columns': ['年月', '部門', '大項目', '中項目', '単位', '区分', '値'],
        'total_records': len(result_df),
        'departments': result_df['部門'].unique().tolist(),
        'data': result_df.to_dict(orient='records')
    }

    json_path = output_path / f'{company_name}_master_data.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f'JSON保存: {json_path}')

    # Google Driveアップロード
    if drive_folder_id:
        print('\nGoogle Driveにアップロード中...')
        service = get_drive_service()
        if service:
            csv_content = result_df.to_csv(index=False, encoding='utf-8-sig').encode('utf-8-sig')
            upload_to_drive(service, csv_content, f'{company_name}_master_data.csv', drive_folder_id, 'text/csv')

            json_content = json.dumps(json_data, ensure_ascii=False, indent=2).encode('utf-8')
            upload_to_drive(service, json_content, f'{company_name}_master_data.json', drive_folder_id, 'application/json')
        else:
            print('[WARN] Google Drive APIが利用できません。ローカル保存のみ完了')

    # サマリー
    print('\n========== サマリー ==========')
    print(f"部門: {result_df['部門'].unique().tolist()}")
    print(f"大項目: {result_df['大項目'].unique().tolist()}")
    print(f"区分: {result_df['区分'].unique().tolist()}")
    print(f"中項目数: {result_df['中項目'].nunique()}")

    return result_df
