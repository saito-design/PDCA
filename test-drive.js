// Google Drive接続テスト
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let key = process.env.GOOGLE_PRIVATE_KEY;
const folderId = process.env.GOOGLE_DRIVE_PDCA_FOLDER_ID;

// キーのクリーンアップ
if (key) {
  key = key.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.substring(1, key.length - 1);
  }
  key = key.replace(/\\n/g, '\n');
}

console.log('=== 環境変数チェック ===');
console.log('Email:', email ? '設定済み' : '未設定');
console.log('Key:', key ? `設定済み (${key.length}文字)` : '未設定');
console.log('Folder ID:', folderId || '未設定');

if (!email || !key || !folderId) {
  console.log('\n環境変数が不足しています');
  process.exit(1);
}

async function testDrive() {
  try {
    const auth = new JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    console.log('\n=== フォルダ一覧取得テスト ===');
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives',
    });

    console.log('成功! ファイル数:', res.data.files?.length || 0);
    if (res.data.files?.length > 0) {
      res.data.files.forEach(f => console.log(`  - ${f.name} (${f.mimeType})`));
    }

    console.log('\n=== テストフォルダ作成 ===');
    const createRes = await drive.files.create({
      requestBody: {
        name: 'test-folder-' + Date.now(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    console.log('成功! 作成されたフォルダ:', createRes.data.name, createRes.data.id);

  } catch (error) {
    console.error('\nエラー:', error.message);
    if (error.response) {
      console.error('詳細:', error.response.data);
    }
  }
}

testDrive();
