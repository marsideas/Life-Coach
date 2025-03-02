import React, { useState, useRef, useEffect } from 'react';
import './App.css'; // 导入CSS文件，用于打字机效果
import { getStoredMessages, storeMessages, getAllChatIds, deleteChat } from './utils/messageStorage';
import { generateTitle, updateChatTitles } from './utils/titleGenerator';

// App组件：Life Compass的主界面组件
// 这里使用函数式组件，因为它更适合使用React Hooks来管理状态和副作用
import chatAvatar from './assets/chat.svg';

function App() {
  const [currentChatId, setCurrentChatId] = useState(() => {
    const lastChatId = localStorage.getItem('lastChatId');
    return lastChatId || null;
  });
  const [messages, setMessages] = useState(() => {
    const lastChatId = localStorage.getItem('lastChatId');
    return lastChatId ? getStoredMessages(lastChatId) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // 从localStorage读取主题设置，默认为false（浅色模式）
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark';
    // 根据保存的主题设置初始化页面
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
    return isDark;
  });
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => {
    // 初始化时从localStorage加载所有对话历史
    const chatIds = getAllChatIds();
    return chatIds.map(id => {
      const messages = getStoredMessages(id);
      return {
        id,
        title: generateTitle(messages),
        messages
      };
    }).sort((a, b) => b.id - a.id); // 按ID降序排序，最新的对话在前面
  });
  const messagesEndRef = useRef(null);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 当消息列表更新时自动滚动到底部并保存到本地存储
  // 这里使用useEffect钩子来监听messages的变化
  useEffect(() => {
    scrollToBottom();
    if (currentChatId) {
      storeMessages(messages, currentChatId);
    }
  }, [messages, currentChatId]);

  // 格式化当前时间为HH:MM格式
  // 这里使用padStart确保小时和分钟始终是两位数
  const formatTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  // 用于跟踪当前正在处理的响应所属的对话ID
  const [processingChatId, setProcessingChatId] = useState(null);

  // 处理消息提交
  // 这里使用异步函数处理API请求和流式响应
  const handleSubmit = async (e, retryCount = 3) => {
    e.preventDefault();
    if (!input.trim()) return;

    // 创建用户消息对象
    const userMessage = { role: 'user', content: input, time: formatTime() };
    
    // 记录当前处理的对话ID，用于确保响应只添加到正确的对话中
    const activeChatId = currentChatId || Date.now().toString();
    setProcessingChatId(activeChatId);
    
    // 如果没有当前对话ID，创建新对话
    if (!currentChatId) {
      const newChat = {
        id: activeChatId,
        title: generateTitle([userMessage]),
        messages: [userMessage]
      };
      setChatHistory(prevHistory => [newChat, ...prevHistory]);
      setCurrentChatId(activeChatId);
      setMessages([userMessage]);
      localStorage.setItem('lastChatId', activeChatId);
    } else {
      // 更新当前对话的消息
      setMessages(prevMessages => [...prevMessages, userMessage]);
      // 同步更新对话历史
      setChatHistory(prevHistory => {
        return prevHistory.map(chat => {
          if (chat.id === activeChatId) {
            const updatedMessages = [...chat.messages, userMessage];
            return { 
              ...chat, 
              messages: updatedMessages,
              title: generateTitle(updatedMessages)
            };
          }
          return chat;
        });
      });
    }
    
    // 保存最后使用的对话ID
    localStorage.setItem('lastChatId', activeChatId || '');
    
    setInput('');
    setIsLoading(true);

    // 立即添加一个空的AI回复消息，用于显示加载动效
    const emptyAssistantMessage = { role: 'assistant', content: '', time: formatTime(), isLoading: true };
    setMessages(prevMessages => [...prevMessages, emptyAssistantMessage]);

    try {
      // 获取当前处理对话的完整消息历史
      let chatMessages = [];
      
      // 从对话历史中获取正确的消息列表
      const currentChat = chatHistory.find(chat => chat.id === activeChatId);
      if (currentChat) {
        // 如果在历史中找到了当前处理的对话，使用其消息历史
        chatMessages = [...currentChat.messages, userMessage];
      } else {
        // 如果是新对话，只包含用户消息
        chatMessages = [userMessage];
      }
      
      const response = await fetch('http://localhost:8080/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: chatMessages,
        }),
      });

      // 处理请求错误
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP错误: ${response.status}` }));
        throw new Error(errorData.error || `请求失败: ${response.status}`);
      }

      // 处理流式响应
      // 这里使用ReadableStream API来处理服务器发送的数据流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = { role: 'assistant', content: '', time: formatTime(), isTyping: true };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') break;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta?.content) {
                // 处理消息内容
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
                setMessages(msgs => {
                  const newMsgs = [...msgs];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg?.role === 'assistant' && !lastMsg.isError) {
                    newMsgs[newMsgs.length - 1] = { ...assistantMessage };
                  } else {
                    newMsgs.push({ ...assistantMessage });
                  }
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error('解析响应数据失败:', e, '原始数据:', line);
            }
          }
        }
      }

      // 响应完成后，移除打字机效果标记
      if (currentChatId === processingChatId) {
        setMessages(msgs => {
          const newMsgs = [...msgs];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg?.role === 'assistant') {
            newMsgs[newMsgs.length - 1] = { ...lastMsg, isTyping: false, isLoading: false };
          }
          return newMsgs;
        });
      }

      // 同步更新对话历史
      setChatHistory(prevHistory => {
        return prevHistory.map(chat => {
          if (chat.id === processingChatId) {
            const updatedMessages = [...chat.messages];
            const lastMsg = updatedMessages[updatedMessages.length - 1];
            if (lastMsg?.role === 'assistant') {
              updatedMessages[updatedMessages.length - 1] = { ...lastMsg, isTyping: false, isLoading: false };
            }
            return { ...chat, messages: updatedMessages };
          }
          return chat;
        });
      });

    } catch (error) {
      // 错误处理
      console.error('发送消息失败:', error);
      // 只有在没有重试次数时才添加错误消息
      if (retryCount <= 0) {
        const errorMessage = error.message || '抱歉，发送消息时出现错误，请稍后重试。';
        
        // 创建错误消息和重试按钮
        const errorMessages = [
          { 
            role: 'assistant', 
            content: errorMessage,
            isError: true,
            time: formatTime()
          },
          {
            role: 'system',
            content: '点击重试',
            isRetry: true,
            time: formatTime(),
            onRetry: () => handleSubmit(e)
          }
        ];

        // 更新当前显示的消息列表和对话历史
        if (currentChatId === processingChatId) {
          setMessages(msgs => {
            const filteredMsgs = msgs.filter(m => !(m.role === 'assistant' && m.isLoading));
            return [...filteredMsgs, ...errorMessages];
          });
        }
        
        setChatHistory(prevHistory => {
          return prevHistory.map(chat => {
            if (chat.id === processingChatId) {
              const filteredMsgs = chat.messages.filter(m => !(m.role === 'assistant' && m.isLoading));
              return { ...chat, messages: [...filteredMsgs, ...errorMessages] };
            }
            return chat;
          });
        });
      } else {
        // 如果还有重试次数，则进行重试
        console.log(`尝试重新发送消息，剩余重试次数: ${retryCount - 1}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return handleSubmit(e, retryCount - 1);
      }
      // 错误处理已在上面的if-else分支中完成，这里不需要重复代码
    } finally {
      setIsLoading(false);
    }
  };

  // 切换主题
  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    // 将主题设置保存到localStorage
    localStorage.setItem('theme', newDarkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark');
  };

  // 创建新对话
  const createNewChat = () => {
    // 如果当前有正在处理的响应，显示警告弹窗
    if (isLoading && processingChatId) {
      setPendingSwitchChatId('new');
      setShowWarningModal(true);
      return;
    }

    // 如果当前有对话，先保存当前对话状态
    if (currentChatId) {
      setChatHistory(prevHistory => {
        return prevHistory.map(chat => {
          if (chat.id === currentChatId) {
            return { ...chat, messages };
          }
          return chat;
        });
      });
    }
    
    // 生成新对话ID和对话对象
    const newChatId = Date.now().toString();
    const welcomeMessage = {
      role: 'assistant',
      content: '👋 你好！我是你的Life Compass助手。我可以帮你：\n\n• 制定个人发展计划\n• 提供职业规划建议\n• 解答生活困惑\n• 给出心理调适建议\n\n让我们开始对话吧！',
      time: formatTime(),
      isWelcome: true // 添加标记，用于应用特殊样式
    };
    const newChat = {
      id: newChatId,
      title: '新对话',
      messages: [welcomeMessage]
    };
    
    // 更新对话历史和当前对话ID
    setChatHistory(prevHistory => [newChat, ...prevHistory]);
    setCurrentChatId(newChatId);
    setMessages(newChat.messages);
    localStorage.setItem('lastChatId', newChatId);
    setShowNewChatModal(false);
  };

  // 删除对话
  const handleDeleteChat = (chatId, e) => {
    e.preventDefault(); // 阻止默认行为
    e.stopPropagation(); // 阻止事件冒泡，避免触发切换对话

    // 如果当前有正在处理的响应，且要删除的是当前正在处理的对话，显示警告弹窗
    if (isLoading && processingChatId && processingChatId === chatId) {
      setPendingSwitchChatId(`delete:${chatId}`);
      setShowWarningModal(true);
      return;
    }

    if (!window.confirm('确定要删除这个对话吗？')) return;

    try {
      // 从本地存储中删除对话
      const success = deleteChat(chatId);
      
      if (success) {
        // 更新对话历史
        setChatHistory(prevHistory => prevHistory.filter(chat => chat.id !== chatId));

        // 如果删除的是当前对话，清空当前对话内容并重置currentChatId
        if (currentChatId === chatId) {
          setMessages([]);
          setCurrentChatId(null);
          localStorage.removeItem('lastChatId');
        }
      } else {
        throw new Error('删除对话失败');
      }
    } catch (error) {
      console.error('删除对话时出错:', error);
      alert('删除对话失败，请稍后重试');
    }
  };

  // 状态变量用于控制警告弹窗的显示
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [pendingSwitchChatId, setPendingSwitchChatId] = useState(null);

  // 切换到指定对话
  const switchToChat = (chatId) => {
    // 如果当前有正在处理的响应，显示警告弹窗
    if (isLoading && processingChatId && processingChatId !== chatId) {
      setPendingSwitchChatId(chatId);
      setShowWarningModal(true);
      return;
    }
    
    // 保存当前对话的消息到历史记录
    if (currentChatId) {
      setChatHistory(prevHistory => {
        return prevHistory.map(chat => {
          if (chat.id === currentChatId) {
            return { ...chat, messages };
          }
          return chat;
        });
      });
    }

    // 切换到新对话
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setCurrentChatId(chatId);
      setMessages(chat.messages || []);
      localStorage.setItem('lastChatId', chatId);
    }
  };

  // 确认离开当前对话
  const confirmLeaveChat = () => {
    if (pendingSwitchChatId) {
      // 保存当前对话的消息到历史记录
      if (currentChatId) {
        setChatHistory(prevHistory => {
          return prevHistory.map(chat => {
            if (chat.id === currentChatId) {
              return { ...chat, messages };
            }
            return chat;
          });
        });
      }

      // 如果是创建新对话
      if (pendingSwitchChatId === 'new') {
        // 直接执行创建新对话的逻辑，绕过createNewChat函数中的警告检查
        // 生成新对话ID和对话对象
        const newChatId = Date.now().toString();
        const newChat = {
          id: newChatId,
          title: `对话 ${newChatId.slice(-4)}`,
          messages: []
        };
        
        // 更新对话历史和当前对话ID
        setChatHistory(prevHistory => [newChat, ...prevHistory]);
        setCurrentChatId(newChatId);
        setMessages([]);
        localStorage.setItem('lastChatId', newChatId);
        setShowNewChatModal(false);
      } 
      // 如果是删除对话
      else if (pendingSwitchChatId.startsWith('delete:')) {
        const chatIdToDelete = pendingSwitchChatId.split(':')[1];
        // 从本地存储中删除对话
        const success = deleteChat(chatIdToDelete);
        
        if (success) {
          // 更新对话历史
          setChatHistory(prevHistory => prevHistory.filter(chat => chat.id !== chatIdToDelete));

          // 如果删除的是当前对话，清空当前对话内容并重置currentChatId
          if (currentChatId === chatIdToDelete) {
            setMessages([]);
            setCurrentChatId(null);
            localStorage.removeItem('lastChatId');
          }
        } else {
          alert('删除对话失败，请稍后重试');
        }
      }
      // 切换到现有对话
      else {
        const chat = chatHistory.find(c => c.id === pendingSwitchChatId);
        if (chat) {
          setCurrentChatId(pendingSwitchChatId);
          setMessages(chat.messages || []);
          localStorage.setItem('lastChatId', pendingSwitchChatId);
        }
      }

      // 重置状态
      setPendingSwitchChatId(null);
      setShowWarningModal(false);
    }
  };

  // 取消离开当前对话
  const cancelLeaveChat = () => {
    setPendingSwitchChatId(null);
    setShowWarningModal(false);
  };

  // 删除单条消息
  const handleDeleteMessage = (messageIndex) => {
    if (isLoading && processingChatId === currentChatId) {
      alert('正在处理消息，请稍后再试');
      return;
    }

    if (!window.confirm('确定要删除这条消息吗？')) return;

    setMessages(prevMessages => {
      const newMessages = prevMessages.filter((_, index) => index !== messageIndex);
      // 如果删除后没有消息了，显示欢迎消息
      if (newMessages.length === 0) {
        return [{
          role: 'assistant',
          content: '👋 你好！我是你的Life Compass助手。我可以帮你：\n\n• 制定个人发展计划\n• 提供职业规划建议\n• 解答生活困惑\n• 给出心理调适建议\n\n让我们开始对话吧！',
          time: formatTime(),
          isWelcome: true // 添加标记，用于应用特殊样式
        }];
      }
      return newMessages;
    });

    // 同步更新对话历史
    setChatHistory(prevHistory => {
      return prevHistory.map(chat => {
        if (chat.id === currentChatId) {
          const newMessages = chat.messages.filter((_, index) => index !== messageIndex);
          // 如果删除后没有消息了，显示欢迎消息
          if (newMessages.length === 0) {
            return {
              ...chat,
              messages: [{
                role: 'assistant',
                content: '👋 你好！我是你的Life Compass助手。我可以帮你：\n\n• 制定个人发展计划\n• 提供职业规划建议\n• 解答生活困惑\n• 给出心理调适建议\n\n让我们开始对话吧！',
                time: formatTime(),
                isWelcome: true // 添加标记，用于应用特殊样式
              }]
            };
          }
          return { ...chat, messages: newMessages };
        }
        return chat;
      });
    });

    // 更新本地存储
    if (currentChatId) {
      const updatedMessages = messages.filter((_, index) => index !== messageIndex);
      storeMessages(updatedMessages, currentChatId);
    }
  };

  // 保存当前对话内容和处理首次对话
  useEffect(() => {
    // 不再自动添加欢迎语
    if (!currentChatId && messages.length > 0) {
      // 首次对话，自动创建新的对话记录
      const newChatId = Date.now().toString();
      const newChat = {
        id: newChatId,
        title: `对话 ${newChatId.slice(-4)}`,
        messages: [...messages] // 创建消息数组的副本
      };
      setChatHistory(prevHistory => [newChat, ...prevHistory]);
      setCurrentChatId(newChatId);
      localStorage.setItem('lastChatId', newChatId);
    }
  }, [messages, currentChatId]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-indigo-50 via-white to-purple-50'} transition-all duration-500`}>
      {/* 左侧菜单 - 优化视觉层次和交互效果 */}
      <div className={`fixed left-0 top-0 h-full w-72 ${darkMode ? 'bg-gray-800/95 backdrop-blur-sm' : 'bg-white/90 backdrop-blur-sm'} shadow-2xl p-6 transition-all duration-500 border-r ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between mb-10">
          <h1 className={`text-2xl font-bold bg-gradient-to-r ${darkMode ? 'from-indigo-400 to-purple-400' : 'from-indigo-600 to-purple-600'} bg-clip-text text-transparent`}>Life Compass</h1>
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-all duration-300 hover:scale-105`}
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
        
        <button
          onClick={createNewChat}
          className={`w-full py-3.5 px-4 rounded-xl mb-6 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'} transition-all duration-300 flex items-center justify-center space-x-2 hover:scale-[1.02] shadow-lg hover:shadow-xl ${darkMode ? 'shadow-indigo-500/20' : 'shadow-indigo-500/30'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="font-medium">新建对话</span>
        </button>

        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-12rem)] pr-2 -mr-2">
          {chatHistory.map((chat, index) => (
            <div
              key={chat.id}
              className={`group relative w-full text-left py-3 px-4 rounded-xl ${darkMode ? 'hover:bg-gray-700/70' : 'hover:bg-gray-100'} ${currentChatId === chat.id ? (darkMode ? 'bg-gray-700/70' : 'bg-gray-100') : ''} transition-all duration-300 hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between w-full">
                <div 
                  className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                  onClick={() => switchToChat(chat.id)}
                >
                  <svg className="w-5 h-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="truncate font-medium">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className={`opacity-0 group-hover:opacity-100 ml-2 p-1.5 rounded-lg ${darkMode ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-red-100 text-red-500 hover:text-red-600'} transition-all duration-300`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧聊天区域 - 优化留白和对比度 */}
      <div className="pl-80 pr-8 py-6 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-6 pb-24">
            {messages.length > 0 ? (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`message-container ${message.role === 'user' ? 'user-message' : 'assistant-message'} group`}
                >
                  {message.role === 'assistant' && (
                    <div className="avatar flex items-center justify-center">
                      <div className="avatar">
                      <img src={chatAvatar} alt="AI" className="img-w-5 h-5" />
                      </div>
                    </div>
                  )}
                  <div className="relative flex-1">
                    <div
                      className={`message-bubble ${message.role === 'user' ? (darkMode ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white') : (darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800')} ${message.role === 'assistant' ? 'shadow-md hover:shadow-lg' : ''} ${darkMode ? 'shadow-gray-800/10' : 'shadow-indigo-100'} transition-shadow duration-300`}
                    >
                      {message.isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', backgroundColor: 'transparent', border: '2px solid currentColor' }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', backgroundColor: 'transparent', border: '2px solid currentColor' }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', backgroundColor: 'transparent', border: '2px solid currentColor' }}></div>
                        </div>
                      ) : message.isTyping ? (
                        <div className="typing-effect whitespace-pre-wrap">{message.content || '　'}</div>
                      ) : message.isRetry ? (
                        <div 
                          className="cursor-pointer text-center py-2 px-4 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors duration-300"
                          onClick={message.onRetry}
                        >
                          {message.content}
                        </div>
                      ) : message.isError ? (
                        <div className="text-red-500 dark:text-red-400 whitespace-pre-wrap">{message.content || '　'}</div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content || '　'}</div>
                      )}
                      {message.usage && (
                        <div className={`mt-2 text-xs ${message.role === 'user' ? 'text-indigo-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
                          Tokens: {message.usage.total_tokens} (输入: {message.usage.prompt_tokens}, 输出: {message.usage.completion_tokens})
                        </div>
                      )}
                      <div className={`mt-1 text-xs ${message.role === 'user' ? 'text-indigo-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
                        {message.time}
                      </div>
                    </div>
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleDeleteMessage(index)}
                      className={`absolute ${message.role === 'user' ? 'left-0' : 'right-0'} top-0 -mt-2 ${message.role === 'user' ? '-ml-8' : '-mr-8'} opacity-0 group-hover:opacity-100 p-1.5 rounded-lg ${darkMode ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-red-100 text-red-500 hover:text-red-600'} transition-all duration-300`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {message.role === 'user' && (
                    <div className="avatar bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))
            ) : (
              /* Life Compass风格的欢迎界面 */
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
                <div className="w-16 h-16 mb-6 rounded-full bg-white flex items-center justify-center">
                  <img src={chatAvatar} alt="AI" className="w-20 h-20" />
                </div>
                <h2 className="text-2xl font-bold mb-2">我是 Life Compass, 很高兴见到你!</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                  👋 你好！我是你的Life Compass助手。我可以帮你：

• 制定个人发展计划
• 提供职业规划建议
• 解答生活困惑
• 给出心理调适建议

让我们开始对话吧！
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框区域 - 优化交互体验 */}
          <div className="fixed bottom-0 left-72 right-0 p-6">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入您的问题..." 
                  className={`w-full py-4 px-6 pr-24 rounded-xl ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200'} border shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300 transform hover:scale-[1.01] focus:scale-[1.01]`}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'} transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 hover:shadow-md`}
                >
                  {isLoading ? (
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.955 7.955 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 警告弹窗 */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl`}>
            <div className="flex items-center mb-4 text-amber-500">
              <svg className="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-xl font-bold">警告</h3>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-300">离开此聊天将中断当前生成，无法恢复。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelLeaveChat}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors duration-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={confirmLeaveChat}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors duration-300"
              >
                坚持离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;