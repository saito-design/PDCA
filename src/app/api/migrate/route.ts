import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Client, Entity, Task, PdcaCycle } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  ensureFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'

// 移行処理
export async function POST(): Promise<NextResponse<ApiResponse<{ message: string; details: string[] }>>> {
  try {
    await requireAuth()

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    const details: string[] = []
    const pdcaFolderId = getPdcaFolderId()

    // クライアント一覧を取得
    const clientsResult = await loadJsonFromFolder<Client[]>(CLIENTS_FILENAME, pdcaFolderId)
    const clients = clientsResult?.data || []
    details.push(`クライアント数: ${clients.length}`)

    for (const client of clients) {
      if (!client.drive_folder_id) {
        details.push(`[SKIP] ${client.name}: drive_folder_idがありません`)
        continue
      }

      details.push(`[処理中] ${client.name}`)

      // 既存のentities.jsonを読み込み
      let entities: Entity[] = []
      try {
        const entitiesResult = await loadJsonFromFolder<Entity[]>(ENTITIES_FILENAME, client.drive_folder_id)
        entities = entitiesResult?.data || []
      } catch {
        details.push(`  - entities.jsonの読み込みに失敗`)
        continue
      }

      // 既存のtasks.jsonを読み込み（企業フォルダ直下）
      let oldTasks: Task[] = []
      try {
        const tasksResult = await loadJsonFromFolder<Task[]>('tasks.json', client.drive_folder_id)
        oldTasks = tasksResult?.data || []
        details.push(`  - 既存タスク数: ${oldTasks.length}`)
      } catch {
        details.push(`  - tasks.jsonなし（スキップ）`)
      }

      // 既存のpdca-cycles.jsonを読み込み（企業フォルダ直下）
      let oldCycles: PdcaCycle[] = []
      try {
        const cyclesResult = await loadJsonFromFolder<PdcaCycle[]>('pdca-cycles.json', client.drive_folder_id)
        oldCycles = cyclesResult?.data || []
        details.push(`  - 既存サイクル数: ${oldCycles.length}`)
      } catch {
        details.push(`  - pdca-cycles.jsonなし（スキップ）`)
      }

      // 各部署を処理
      let updatedEntities = false
      for (const entity of entities) {
        // drive_folder_idがない場合はフォルダを作成
        if (!entity.drive_folder_id) {
          try {
            const entityFolderId = await ensureFolder(entity.name, client.drive_folder_id)
            entity.drive_folder_id = entityFolderId
            updatedEntities = true
            details.push(`  - [作成] ${entity.name} フォルダ: ${entityFolderId.substring(0, 10)}...`)
          } catch (error) {
            details.push(`  - [ERROR] ${entity.name} フォルダ作成失敗: ${error}`)
            continue
          }
        } else {
          details.push(`  - [既存] ${entity.name} フォルダ: ${entity.drive_folder_id.substring(0, 10)}...`)
        }

        // この部署のタスクをフィルタ
        const entityTasks = oldTasks.filter(t => t.entity_name === entity.name)
        if (entityTasks.length > 0) {
          try {
            await saveJsonToFolder(entityTasks, 'tasks.json', entity.drive_folder_id)
            details.push(`    - tasks.json: ${entityTasks.length}件`)
          } catch (error) {
            details.push(`    - [ERROR] tasks.json保存失敗: ${error}`)
          }
        }

        // この部署のサイクルをフィルタ
        const entityCycles = oldCycles.filter(c => c.entity_id === entity.id)
        if (entityCycles.length > 0) {
          try {
            await saveJsonToFolder(entityCycles, 'cycles.json', entity.drive_folder_id)
            details.push(`    - cycles.json: ${entityCycles.length}件`)
          } catch (error) {
            details.push(`    - [ERROR] cycles.json保存失敗: ${error}`)
          }
        }
      }

      // entities.jsonを更新（drive_folder_idを追加した場合）
      if (updatedEntities) {
        try {
          await saveJsonToFolder(entities, ENTITIES_FILENAME, client.drive_folder_id)
          details.push(`  - entities.json更新完了`)
        } catch (error) {
          details.push(`  - [ERROR] entities.json更新失敗: ${error}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: '移行処理が完了しました',
        details,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Migration error:', error)
    return NextResponse.json(
      { success: false, error: `移行に失敗しました: ${error}` },
      { status: 500 }
    )
  }
}
