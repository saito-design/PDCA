"""
鹿児島県市町村職員共済組合 - データ変換スクリプト

Excel報告書を縦持ちJSON/CSVに変換し、Google Driveにアップロードします。
"""

import os
import sys
from pathlib import Path

# 共通ライブラリをインポート
sys.path.insert(0, str(Path(__file__).parent))
from convert_lib import (
    setup_google_auth,
    get_drive_service,
    find_folder_by_name,
    convert_excel_to_master_db,
)

# ========== 鹿児島用設定 ==========
COMPANY_NAME = 'kagoshima'
CLIENT_FOLDER_NAME = '鹿児島県市町村職員共済組合'

# Excelファイルパス（必要に応じて変更）
EXCEL_FILE = r'C:\Users\yasuh\OneDrive\デスクトップ\報告 2026.2.18.xlsx'

# ローカル出力先
OUTPUT_DIR = Path(__file__).parent.parent / 'data' / COMPANY_NAME

# 環境変数ファイル
ENV_FILE = Path(__file__).parent.parent / '.env.local'
# =====================================


def main():
    print('=' * 50)
    print(f'  {CLIENT_FOLDER_NAME} データ変換')
    print('=' * 50)

    # Excelファイル確認
    if not Path(EXCEL_FILE).exists():
        print(f'[ERROR] Excelファイルが見つかりません: {EXCEL_FILE}')
        print('EXCEL_FILE のパスを確認してください。')
        if sys.stdin.isatty():
            input('\nEnterキーで終了...')
        return

    # Google認証セットアップ
    print('\n認証情報を読み込み中...')
    setup_google_auth(str(ENV_FILE))

    # PDCAフォルダID取得
    pdca_folder_id = os.environ.get('GOOGLE_DRIVE_PDCA_FOLDER_ID')

    # クライアントフォルダ検索
    client_folder_id = None
    if pdca_folder_id:
        print('Google Drive接続中...')
        service = get_drive_service()
        if service:
            client_folder_id = find_folder_by_name(service, CLIENT_FOLDER_NAME, pdca_folder_id)
            if client_folder_id:
                print(f'  -> クライアントフォルダ: {CLIENT_FOLDER_NAME}')
            else:
                print(f'[WARN] クライアントフォルダが見つかりません: {CLIENT_FOLDER_NAME}')
                print('       ローカル保存のみ実行します。')
    else:
        print('[WARN] GOOGLE_DRIVE_PDCA_FOLDER_ID が設定されていません')
        print('       ローカル保存のみ実行します。')

    # 変換実行
    print('\n変換開始...')
    try:
        df = convert_excel_to_master_db(
            excel_path=EXCEL_FILE,
            output_path=str(OUTPUT_DIR),
            company_name=COMPANY_NAME,
            drive_folder_id=client_folder_id
        )

        print('\n' + '=' * 50)
        print('  変換完了!')
        print('=' * 50)
        print(f'\nローカル出力先: {OUTPUT_DIR}')
        if client_folder_id:
            print(f'Google Drive: {CLIENT_FOLDER_NAME}フォルダにアップロード済み')

    except Exception as e:
        print(f'\n[ERROR] 変換に失敗しました: {e}')
        import traceback
        traceback.print_exc()

    # 対話的環境でのみ待機
    if sys.stdin.isatty():
        input('\nEnterキーで終了...')


if __name__ == '__main__':
    main()
