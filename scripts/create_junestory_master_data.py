"""
ジュネストリーのPOS/PLデータをmaster_data.json形式に統合

他企業と同じ形式でダッシュボードに表示できるようにする
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import setup_google_auth, get_drive_service

JUNESTORY_FOLDER_ID = '1Bt8WpIQWUiHiOCct_c1AikDOZ5CKprCL'

def load_json(filepath):
    """JSONファイルを読み込み"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def create_master_data():
    """POS/PLデータを統合してmaster_data形式に変換"""
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    data_dir = project_dir / 'data' / 'junestory'

    # データ読み込み
    pos_data = load_json(data_dir / 'pos_data.json')
    pl_data = load_json(data_dir / 'pl_data.json')

    # エンティティ（店舗）マッピング読み込み
    stores_data = load_json(script_dir / 'junestory_stores.json')
    store_names = {s['store_code']: s['name'] for s in stores_data['stores']}

    # 統合データを作成
    combined_data = []

    # POSデータを変換
    for record in pos_data.get('data', []):
        store_code = record.get('店舗コード', '')
        store_name = store_names.get(store_code, record.get('店舗名', store_code))

        combined_data.append({
            '年月': record.get('年月', ''),
            '部門': store_name,
            '店舗コード': store_code,
            '大項目': f"POS_{record.get('大項目', '')}",
            '中項目': record.get('中項目', ''),
            '単位': record.get('単位', ''),
            '区分': record.get('区分', '実績'),
            '値': record.get('値'),
        })

    # PLデータを変換
    for record in pl_data.get('data', []):
        store_code = record.get('店舗コード', '')
        store_name = store_names.get(store_code, record.get('店舗名', store_code))

        combined_data.append({
            '年月': record.get('年月', ''),
            '部門': store_name,
            '店舗コード': store_code,
            '大項目': f"PL_{record.get('大項目', '')}",
            '中項目': record.get('中項目', ''),
            '単位': record.get('単位', ''),
            '区分': record.get('区分', '実績'),
            '値': record.get('値'),
        })

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
        print(f'更新: {filename}')
    else:
        file_metadata = {'name': filename, 'parents': [folder_id]}
        service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f'作成: {filename}')

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

    # ローカル保存
    output_path = project_dir / 'data' / 'junestory' / 'junestory_master_data.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(master_data, f, ensure_ascii=False, indent=2)
    print(f"\nローカル保存: {output_path}")

    # Google Driveアップロード
    service = get_drive_service()
    if service:
        print("\nGoogle Driveにアップロード中...")
        upload_to_drive(service, master_data, 'junestory_master_data.json', JUNESTORY_FOLDER_ID)
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
