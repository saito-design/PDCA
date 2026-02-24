"""
ジュネストリーを /clients システムに統合するスクリプト

1. ジュネストリーをクライアントとしてGoogle Driveに登録
2. 店舗をエンティティとして登録
3. POS/PLデータをクライアントフォルダにコピー
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import setup_google_auth, get_drive_service, upload_to_drive

# ジュネストリーフォルダID
JUNESTORY_FOLDER_ID = '1Bt8WpIQWUiHiOCct_c1AikDOZ5CKprCL'
PDCA_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_PDCA_FOLDER_ID', '0ACzzaasVce2zUk9PVA')

def load_stores():
    """店舗マスタを読み込み"""
    script_dir = Path(__file__).parent
    stores_path = script_dir / 'junestory_stores.json'
    with open(stores_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def create_client_entry():
    """クライアントエントリを作成"""
    return {
        'id': 'client-junestory',
        'name': '株式会社ジュネストリー',
        'drive_folder_id': JUNESTORY_FOLDER_ID,
        'created_at': datetime.now().isoformat(),
    }

def create_entities(stores_data):
    """店舗からエンティティを作成"""
    entities = []
    for i, store in enumerate(stores_data['stores']):
        entity = {
            'id': f"client-junestory-{store['store_code']}",
            'client_id': 'client-junestory',
            'name': store['name'],
            'sort_order': (i + 1) * 100,
            'created_at': datetime.now().isoformat(),
            # 追加情報
            'store_code': store['store_code'],
            'brand': store.get('brand'),
            'brand_name': store.get('brand_name'),
            'manager_name': store.get('manager_name'),
        }
        entities.append(entity)
    return entities

def upload_json_to_drive(service, data, filename, folder_id):
    """JSONをGoogle Driveにアップロード"""
    from googleapiclient.http import MediaInMemoryUpload

    content = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')

    # 既存ファイルを検索
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
        print(f'  更新: {filename}')
    else:
        file_metadata = {'name': filename, 'parents': [folder_id]}
        service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f'  作成: {filename}')

def load_existing_clients(service, pdca_folder_id):
    """既存のclients.jsonを読み込み"""
    query = f"name='clients.json' and '{pdca_folder_id}' in parents and trashed=false"
    results = service.files().list(
        q=query,
        fields='files(id)',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()
    files = results.get('files', [])

    if not files:
        return []

    from googleapiclient.http import MediaIoBaseDownload
    import io

    file_id = files[0]['id']
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    fh.seek(0)
    content = fh.read().decode('utf-8')
    return json.loads(content)

def main():
    print("========== ジュネストリー統合開始 ==========\n")

    # 環境設定
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    env_path = project_dir / '.env.local'

    if env_path.exists():
        setup_google_auth(str(env_path))

    # Google Drive接続
    service = get_drive_service()
    if not service:
        print("ERROR: Google Drive API接続失敗")
        return

    print("Google Drive API接続成功\n")

    # 店舗データ読み込み
    stores_data = load_stores()
    print(f"店舗数: {len(stores_data['stores'])}件\n")

    # 1. クライアント登録
    print("1. クライアント登録...")
    clients = load_existing_clients(service, PDCA_FOLDER_ID)

    # 既存のジュネストリーを削除
    clients = [c for c in clients if c.get('id') != 'client-junestory']

    # 新しいエントリを追加
    junestory_client = create_client_entry()
    clients.append(junestory_client)

    upload_json_to_drive(service, clients, 'clients.json', PDCA_FOLDER_ID)
    print(f"  クライアントID: {junestory_client['id']}")
    print(f"  フォルダID: {junestory_client['drive_folder_id']}\n")

    # 2. エンティティ（店舗）登録
    print("2. エンティティ登録...")
    entities = create_entities(stores_data)
    upload_json_to_drive(service, entities, 'entities.json', JUNESTORY_FOLDER_ID)
    print(f"  登録数: {len(entities)}店舗\n")

    # 注: PDCAファイル(pdca-issues.json, pdca-cycles.json, tasks.json)は
    # 旧構造のため作成しない。現在は master-data.json を使用。

    print("\n========== 統合完了 ==========")
    print(f"企業ページURL: /clients/client-junestory")
    print(f"DriveフォルダURL: https://drive.google.com/drive/folders/{JUNESTORY_FOLDER_ID}")

if __name__ == '__main__':
    main()
