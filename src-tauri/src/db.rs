use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct VaultDatabase {
    #[serde(default)]
    pub settings: serde_json::Value,
    #[serde(default)]
    pub items: Vec<serde_json::Value>,
    #[serde(default)]
    pub emeralds: Vec<serde_json::Value>,
    #[serde(default)]
    pub memos: Vec<serde_json::Value>,
    #[serde(default)]
    pub stones: Vec<serde_json::Value>,
    #[serde(rename = "jewelStoneMemos", default)]
    pub jewel_stone_memos: Vec<serde_json::Value>,
    #[serde(rename = "jewelryMemos", default)]
    pub jewelry_memos: Vec<serde_json::Value>,
    #[serde(default)]
    pub logs: Vec<serde_json::Value>,
}
