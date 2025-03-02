// 消息历史记录管理工具
// 使用localStorage存储聊天记录

// 存储消息的键名前缀
const STORAGE_KEY_PREFIX = 'life_compass_chat_';

// 获取指定对话的消息
export const getStoredMessages = (chatId = null) => {
  try {
    if (!chatId) return [];
    const key = STORAGE_KEY_PREFIX + chatId;
    const messages = localStorage.getItem(key);
    return messages ? JSON.parse(messages) : [];
  } catch (error) {
    console.error('读取消息历史记录失败:', error);
    return [];
  }
};

// 存储消息
export const storeMessages = (messages, chatId) => {
  try {
    if (!chatId) return;
    const key = STORAGE_KEY_PREFIX + chatId;
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error('保存消息历史记录失败:', error);
  }
};

// 清除指定对话的消息
export const clearStoredMessages = (chatId = null) => {
  try {
    if (!chatId) return;
    const key = STORAGE_KEY_PREFIX + chatId;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('清除消息历史记录失败:', error);
  }
};

// 获取最近的消息（可以指定数量）
export const getRecentMessages = (chatId, count = 10) => {
  if (!chatId) return [];
  const messages = getStoredMessages(chatId);
  return messages.slice(-count);
};

// 获取所有对话的ID列表
export const getAllChatIds = () => {
  try {
    const chatIds = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        chatIds.push(key.slice(STORAGE_KEY_PREFIX.length));
      }
    }
    return chatIds;
  } catch (error) {
    console.error('获取对话列表失败:', error);
    return [];
  }
};

// 删除指定对话及其所有消息
export const deleteChat = (chatId) => {
  try {
    if (!chatId) return false;
    const key = STORAGE_KEY_PREFIX + chatId;
    localStorage.removeItem(key);
    // 验证删除是否成功
    return !localStorage.getItem(key);
  } catch (error) {
    console.error('删除对话失败:', error);
    return false;
  }
};