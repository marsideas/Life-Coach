import React, { useState, useRef, useEffect } from 'react';

// App组件：Life Coach AI助手的主界面组件
// 这里使用函数式组件，因为它更适合使用React Hooks来管理状态和副作用
function App() {
  // 状态管理
  // 这里使用useState来管理聊天消息、输入框内容和加载状态
  const [messages, setMessages] = useState([]); // 存储聊天历史记录
  const [input, setInput] = useState(''); // 管理输入框的内容
  const [isLoading, setIsLoading] = useState(false); // 控制加载状态
  const messagesEndRef = useRef(null); // 用于自动滚动到最新消息

  // 自动滚动到最新消息
  // 这里使用平滑滚动效果提升用户体验
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 当消息列表更新时自动滚动到底部
  // 这里使用useEffect钩子来监听messages的变化
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 格式化当前时间为HH:MM格式
  // 这里使用padStart确保小时和分钟始终是两位数
  const formatTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  // 处理消息提交
  // 这里使用异步函数处理API请求和流式响应
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // 创建用户消息对象并添加到消息列表
    const userMessage = { role: 'user', content: input, time: formatTime() };
    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 发送聊天请求到后端API
      // 这里使用fetch API发送POST请求
      const response = await fetch('http://localhost:8081/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      // 处理请求错误
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      // 处理流式响应
      // 这里使用ReadableStream API来处理服务器发送的数据流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = { role: 'assistant', content: '', time: formatTime() };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              if (line.includes('[DONE]')) break;
              const data = JSON.parse(line.slice(6));
              if (data.delta?.content) {
                // 处理消息内容
                // 这里去除开头的空白字符，保持文本显示整洁
                if (assistantMessage.content === '') {
                  assistantMessage.content = data.delta.content.trimStart();
                } else {
                  assistantMessage.content += data.delta.content;
                }
                // 更新usage信息
                if (data.usage) {
                  assistantMessage.usage = data.usage;
                }
                // 更新消息列表
                // 这里使用函数式更新确保状态更新的准确性
                setMessages(msgs => {
                  const newMsgs = [...msgs];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg?.role === 'assistant' && !lastMsg.isError) {
                    newMsgs[newMsgs.length - 1] = { ...assistantMessage };
                  } else if (!lastMsg || lastMsg.role === 'user') {
                    newMsgs.push({ ...assistantMessage });
                  }
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error('解析响应数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      // 错误处理
      // 这里显示友好的错误消息给用户
      console.error('发送消息失败:', error);
      const errorMessage = error.message || '抱歉，发送消息时出现错误，请稍后重试。';
      setMessages(msgs => [...msgs, { 
        role: 'assistant', 
        content: errorMessage,
        isError: true,
        time: formatTime()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 transition-all duration-300">
      <div className="max-w-4xl mx-auto mb-8 text-center">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 mb-3 transform hover:scale-105 transition-transform duration-300">Life Coach AI 助手</h1>
        <p className="text-gray-600 text-lg font-medium">您的智能生活教练，随时为您提供建议和支持</p>
      </div>

      <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-indigo-50 transition-all duration-300 hover:shadow-indigo-100">
        <div className="h-[600px] overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-32 space-y-6 animate-fade-in">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full flex items-center justify-center transform hover:rotate-12 transition-all duration-300">
                <svg className="w-12 h-12 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="transform hover:scale-105 transition-all duration-300">
                <p className="text-2xl font-medium text-indigo-600">开始与您的 AI 助手对话吧</p>
                <p className="text-sm mt-3 text-gray-500">我可以帮您解答问题，提供建议，或者只是聊聊天</p>
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} items-end space-x-3 animate-fade-in`}
            >
              {message.role === 'assistant' && !message.isError && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0 transform hover:rotate-12 transition-all duration-300">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              )}
              <div className="group relative max-w-[75%]">
                <div
                  className={`rounded-xl px-4 py-3 ${message.role === 'user' 
                    ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' 
                    : message.isError
                      ? 'bg-red-50 text-red-600 border border-red-100'
                      : 'bg-gray-50 text-gray-800'} 
                    shadow-lg transition-all duration-300 hover:shadow-xl transform hover:-translate-y-1`}
                >
                  <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</div>
                  <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-indigo-200' : 'text-gray-400'} flex justify-between items-center`}>
                    <span>{message.time}</span>
                    {message.role === 'assistant' && message.usage && (
                      <span className="ml-2">消耗 {message.usage.total_tokens || 0} tokens</span>
                    )}
                  </div>
                </div>
              </div>
              {message.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0 transform hover:rotate-12 transition-all duration-300">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start items-end space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center transform hover:rotate-12 transition-all duration-300">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="bg-gray-50 rounded-xl px-6 py-4 max-w-[75%] shadow-lg">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full animate-bounce"></div>
                  <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="border-t border-indigo-50 p-6 bg-white/90 backdrop-blur-sm">
          <div className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入您的问题或想法..."
              className="flex-1 rounded-lg border-2 border-indigo-100 px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 placeholder-gray-400 bg-white/50 backdrop-blur-sm text-[15px]"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-lg hover:opacity-90 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:hover:transform-none"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? '发送中...' : '发送'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;