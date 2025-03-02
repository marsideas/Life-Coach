// 标题生成工具
// 用于根据对话内容自动生成简短的标题

/**
 * 根据对话消息生成标题
 * @param {Array} messages - 对话消息数组
 * @param {number} maxLength - 标题最大长度
 * @returns {string} - 生成的标题
 */
export const generateTitle = (messages, maxLength = 20) => {
  try {
    // 如果没有消息，返回默认标题
    if (!messages || messages.length === 0) {
      return '新对话';
    }

    // 查找第一条用户消息
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (!firstUserMessage) {
      return '新对话';
    }

    // 提取用户消息的前几个字作为标题
    let title = firstUserMessage.content.trim();

    // 移除多余的空白字符
    title = title.replace(/\s+/g, ' ');

    // 如果消息太长，截取前面的部分
    if (title.length > maxLength) {
      // 尝试在一个完整的词或句子处截断
      const endPos = title.substring(0, maxLength).lastIndexOf(' ');
      title = title.substring(0, endPos > 0 ? endPos : maxLength);
    }

    // 确保标题不为空
    return title || '新对话';
  } catch (error) {
    console.error('生成标题失败:', error);
    return '新对话';
  }
};

/**
 * 更新对话历史中的标题
 * @param {Array} chatHistory - 对话历史数组
 * @returns {Array} - 更新后的对话历史
 */
export const updateChatTitles = (chatHistory) => {
  if (!chatHistory || !Array.isArray(chatHistory)) {
    return [];
  }

  return chatHistory.map(chat => {
    if (chat.messages && chat.messages.length > 0) {
      return {
        ...chat,
        title: generateTitle(chat.messages)
      };
    }
    return chat;
  });
};