// src/services/notion.ts

const NOTION_API_VERSION = '2022-06-28';

async function getToken() {
  const result = await chrome.storage.local.get('notion_token');
  if (!result.notion_token) throw new Error("Not authenticated");
  return result.notion_token;
}

export async function getDatabases() {
  const token = await getToken();
  // Using the search endpoint narrowed to databases.
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: { value: 'database', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch databases: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.results;
}

export async function createTemplateDatabase(parentPageId: string) {
  const token = await getToken();
  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
       'Authorization': `Bearer ${token}`,
       'Notion-Version': NOTION_API_VERSION,
       'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "TubeSync Watch Later" } }],
      properties: {
        "Title": { title: {} },
        "URL": { url: {} },
        "Channel": { rich_text: {} },
        "Status": {
          select: {
            options: [
              { name: "To Watch", color: "blue" },
              { name: "Watched", color: "green" },
              { name: "Archived", color: "default" }
            ]
          }
        },
        "Tags": { multi_select: {} },
        "Reference": { checkbox: {} }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create db: ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}

export async function saveVideo(databaseId: string, videoUrl: string, title?: string, channel?: string) {
  const token = await getToken();
  const response = await fetch('https://api.notion.com/v1/pages', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Notion-Version': NOTION_API_VERSION,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       parent: { database_id: databaseId },
       properties: {
         "Title": { title: [{ text: { content: title || "New Video" } }] },
         "URL": { url: videoUrl },
         "Status": { select: { name: "To Watch" } },
         "Channel": { rich_text: [{ text: { content: channel || "" } }]}
       }
     })
  });
  
  if (!response.ok) {
     const errorText = await response.text();
     throw new Error(`Failed to save video: ${errorText}`);
  }
  return await response.json();
}
