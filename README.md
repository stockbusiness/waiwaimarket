# EduSpeak 連携ガイド

> **最終更新**: 2025年12月31日  
> **APIバージョン**: v1  
> **APIキープレフィックス**: `es_`

---

## 目次

1. [概要](#概要)
2. [認証](#認証)
3. [工程API](#工程api)
4. [学習ログAPI](#学習ログapi)
5. [学習進捗API](#学習進捗api)
6. [発音API](#発音api)
7. [MCP API](#mcp-api)
8. [Webhooks](#webhooks)
9. [データモデル](#データモデル)
10. [実装例](#実装例)

---

## 概要

EduSpeakは教育特化の音声学習プラットフォームです。ManuTraceと連携することで：

- マニュアルを「工程」として取得し、学習コンテンツとして活用
- 学習ログをManuTraceに送信し、マニュアル改善に活用
- 発音データを取得し、音声学習機能を提供

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        EduSpeak                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 工程閲覧    │  │ 音声練習    │  │ 学習進捗    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                     ManuTrace Data Hub                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 工程API     │  │ 発音API     │  │ 学習ログAPI │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### ベースURL

```
https://your-domain.replit.app/api/v1
```

---

## 認証

### APIキー形式

- **プレフィックス**: `es_`
- **例**: `es_a1b2c3d4e5f6789012345678901234567890abcdef`

### リクエストヘッダー

```http
Authorization: Bearer es_your_api_key
Content-Type: application/json
```

### 権限

| 権限 | 説明 |
|------|------|
| `read` | 工程データの読み取りのみ |
| `write` | 学習ログの送信のみ |
| `read_write` | すべての操作が可能 |

---

## 工程API

マニュアルを「工程」形式で取得します。

### GET /api/v1/processes

工程一覧を取得します。

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `page` | number | 1 | ページ番号 |
| `perPage` | number | 50 | 1ページあたりの件数（最大100） |

**リクエスト:**

```bash
curl -X GET "https://your-domain.replit.app/api/v1/processes?page=1&perPage=50" \
  -H "Authorization: Bearer es_your_api_key"
```

**レスポンス:**

```json
{
  "processes": [
    {
      "processId": "PROC-001",
      "revisionId": "REV-1",
      "title": "操作マニュアル",
      "content": "1. クリック: ボタンをクリックします...",
      "importance": "medium",
      "warnings": [],
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "perPage": 50,
    "total": 10
  }
}
```

### GET /api/v1/processes/:processId

特定工程の詳細を取得します（ステップ情報含む）。

**レスポンス:**

```json
{
  "processId": "PROC-001",
  "revisionId": "REV-1",
  "title": "操作マニュアル",
  "content": "...",
  "steps": [
    {
      "stepNumber": 1,
      "action": "クリック",
      "description": "ボタンをクリックします",
      "imageUrl": "https://..."
    }
  ]
}
```

---

## 学習ログAPI

学習履歴をManuTraceに送信します。

### POST /api/v1/learning-logs

**リクエスト:**

```json
{
  "tenantId": "tenant-001",
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "processLogs": [
    {
      "processId": "PROC-001",
      "revisionId": "REV-1",
      "startedAt": "2025-01-01T09:00:00.000Z",
      "completedAt": "2025-01-01T09:30:00.000Z",
      "status": "completed",
      "score": 85,
      "attempts": 1
    }
  ]
}
```

**レスポンス:**

```json
{
  "success": true,
  "received": 1,
  "syncId": "sync_abc123"
}
```

---

## 学習進捗API

リアルタイムで学習進捗を送信します。

### POST /api/learning-data/eduspeak-progress

**リクエスト:**

```json
{
  "userId": "user_123",
  "processId": "PROC-001",
  "stepNumber": 3,
  "progressPercent": 60,
  "timeSpentSeconds": 120,
  "pronunciationScore": 85
}
```

### GET /api/learning-data/eduspeak-progress/stats

学習進捗統計を取得します。

**レスポンス:**

```json
{
  "totalUsers": 150,
  "avgCompletionRate": 0.72,
  "avgScore": 82.5,
  "popularProcesses": [
    { "processId": "PROC-001", "accessCount": 500 }
  ]
}
```

---

## 発音API

辞書エントリの発音データを取得します。

### GET /api/v1/pronunciations/:entryId

**レスポンス:**

```json
{
  "entryId": 123,
  "term": "株式会社",
  "reading": "かぶしきがいしゃ",
  "pitchAccent": {
    "type": "nakadaka",
    "position": 4,
    "moraPitchContour": "LHHHL"
  },
  "audioUrl": "https://..."
}
```

### POST /api/v1/pronunciations/feedback

発音フィードバックを送信します。

**リクエスト:**

```json
{
  "entryId": 123,
  "userId": "user_001",
  "feedbackType": "correction",
  "suggestedReading": "かぶしきかいしゃ",
  "context": "会話中の発音"
}
```

---

## MCP API

Model Context Protocol準拠のエンドポイント。

### POST /api/mcp/tools/extract_knowledge

マニュアルからナレッジを抽出します。

**リクエスト:**

```json
{
  "manualId": 123,
  "extractionType": "key_points"
}
```

### POST /api/mcp/tools/generate_voice_news

音声ニュースを生成します。

**リクエスト:**

```json
{
  "topic": "週次アップデート",
  "manualIds": [1, 2, 3]
}
```

### POST /api/mcp/tools/sync_manuals

マニュアルを同期します。

---

## Webhooks

EduSpeakは以下のWebhookイベントを受信できます。

### イベント一覧

| イベント | 説明 |
|---------|------|
| `manual.created` | マニュアル作成 |
| `manual.updated` | マニュアル更新 |
| `manual.published` | マニュアル公開 |
| `manual.deleted` | マニュアル削除 |
| `knowledge.extracted` | ナレッジ抽出完了 |
| `voice-news.generated` | 音声ニュース生成完了 |
| `learning-log.processed` | 学習ログ処理完了 |
| `learning-progress.updated` | 学習進捗更新 |
| `improvement-suggestion.created` | 改善提案生成 |

### ペイロード例

```json
{
  "event": "manual.updated",
  "timestamp": "2025-12-31T10:00:00.000Z",
  "data": {
    "manualId": 123,
    "title": "更新されたマニュアル",
    "version": "2.0"
  },
  "signature": "sha256=..."
}
```

→ 詳細: [eduspeak-webhook-specification.md](../eduspeak-webhook-specification.md)

---

## データモデル

### 工程（Process）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `processId` | string | 工程ID |
| `revisionId` | string | リビジョンID |
| `title` | string | タイトル |
| `content` | string | 内容（テキスト形式） |
| `importance` | string | 重要度: low, medium, high |
| `warnings` | string[] | 警告メッセージ |
| `updatedAt` | string | 更新日時（ISO 8601） |

### 学習ログ（Learning Log）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `processId` | string | 工程ID |
| `revisionId` | string | リビジョンID |
| `startedAt` | string | 開始日時 |
| `completedAt` | string | 完了日時 |
| `status` | string | ステータス: started, completed, abandoned |
| `score` | number | スコア（0-100） |
| `attempts` | number | 試行回数 |

---

## 実装例

### TypeScript SDK

```typescript
class EduSpeakClient {
  private baseUrl = 'https://your-domain.replit.app/api/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    return response.json();
  }

  async getProcesses(page = 1, perPage = 50) {
    return this.request(`/processes?page=${page}&perPage=${perPage}`);
  }

  async getProcess(processId: string) {
    return this.request(`/processes/${processId}`);
  }

  async sendLearningLogs(logs: any) {
    return this.request('/learning-logs', {
      method: 'POST',
      body: JSON.stringify(logs),
    });
  }
}

// 使用例
const client = new EduSpeakClient('es_your_api_key');
const processes = await client.getProcesses();
```

---

## 関連ドキュメント

- [ManuTrace API 総合ガイド](../ManuTrace-API-Guide.md)
- [EduSpeak Webhook詳細仕様](../eduspeak-webhook-specification.md)
- [Dictionary Hub API](../DEVELOPER_API_GUIDE.md#共通api)

---

**お問い合わせ**: support@manutrace.com
