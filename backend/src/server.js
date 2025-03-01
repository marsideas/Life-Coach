import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Token计算函数
// 这里实现了一个简单的token计算方法，分别处理中文和其他字符
function calculateTokens(text) {
  if (!text) return 0;
  
  // 将文本按空格分割
  // 这里使用正则表达式匹配一个或多个空白字符
  const words = text.split(/\s+/);
  let totalTokens = 0;

  for (const word of words) {
    if (!word) continue;
    
    // 分别计算中文字符和其他字符
    // 这里使用Unicode范围匹配中文字符
    const chineseChars = word.match(/[\u4e00-\u9fa5]/g) || [];
    const otherChars = word.replace(/[\u4e00-\u9fa5]/g, '');
    
    // 中文字符：每个字符算1个token
    totalTokens += chineseChars.length;
    
    // 其他字符：每4个字符算1个token（向上取整）
    if (otherChars.length > 0) {
      totalTokens += Math.ceil(otherChars.length / 4);
    }
  }

  // 空格也计入token
  // 这里匹配所有空白字符序列
  const spaces = text.match(/\s+/g) || [];
  totalTokens += spaces.length;

  return Math.max(1, totalTokens); // 确保至少返回1个token
}

// 加载环境变量
// 这里使用dotenv来管理敏感配置信息
dotenv.config();

// 创建Express应用实例
// 这里设置默认端口为8080
const app = express();
const port = 8080;

// 启用中间件
// 这里启用CORS支持跨域请求，使用express.json()解析JSON请求体
app.use(cors());
app.use(express.json());

// API配置
// 这里配置火山方舟API的密钥和端点URL
const API_KEY = process.env.ARK_API_KEY;
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 环境变量验证
// 这里确保必要的API密钥已经设置
if (!API_KEY) {
  console.error('错误: 未设置ARK_API_KEY环境变量');
  process.exit(1);
}

// 处理聊天请求的路由
// 这里实现了与DeepSeek API的集成和流式响应处理
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // 计算输入tokens
    // 这里累加所有消息内容的token数量
    const promptTokens = messages.reduce((total, msg) => {
      return total + calculateTokens(msg.content);
    }, 0);

    // 设置API请求头
    // 这里包含认证信息和内容类型
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json'
    };

    // 准备请求体
    // 这里配置模型参数和系统提示词
    const requestBody = {
      model: 'deepseek-r1-250120',
      messages: [
        { role: 'system', content: '你是一位专业的Life Coach，擅长通过对话帮助他人发现自身潜力，解决生活和工作中的困扰。你会以同理心倾听，提出有见地的问题，给出实用的建议，帮助对方制定可行的行动计划。' },
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ],
      stream: true,
      temperature: 0.6,
      max_tokens: 2000
    };

    // 设置响应头
    // 这里配置支持流式输出的响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送API请求
    // 这里设置60秒超时时间
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      timeout: 60000 // 60秒超时
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: { message: errorText } };
      }

      // 处理特定类型的错误
      if (response.status === 401 || response.status === 403) {
        throw new Error('API认证失败，请检查API密钥配置是否正确。');
      } else if (response.status === 429) {
        throw new Error('请求过于频繁，请稍后再试。');
      } else if (response.status === 503) {
        throw new Error('服务暂时不可用，请稍后再试。');
      } else {
        throw new Error(`API请求失败: ${response.status}, ${errorData.error?.message || errorText}`);
      }
    }

    // 初始化请求级别的completion tokens计数器
    let requestCompletionTokens = 0;

    // 处理流式响应
    for await (const chunk of response.body) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.trim() === 'data: [DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        if (line.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(line.slice(6));
            const delta = jsonData.choices?.[0]?.delta;
            if (delta && (delta.content || delta.role)) {
              // 计算当前响应块的token使用量
              let currentTokens = 0;
              if (delta.content) {
                currentTokens = calculateTokens(delta.content);
                requestCompletionTokens += currentTokens;
              }
              // 构建usage信息
              const totalUsage = {
                prompt_tokens: promptTokens,
                completion_tokens: requestCompletionTokens,
                total_tokens: promptTokens + requestCompletionTokens
              };
              // 确保每个响应块都包含完整的usage信息
              const responseData = {
                delta,
                usage: totalUsage
              };
              res.write(`data: ${JSON.stringify(responseData)}\n\n`);
            }
          } catch (e) {
            console.error('解析响应数据失败:', e, '原始数据:', line);
          }
        }
      }
    }

    res.end();
  } catch (error) {
    console.error('处理请求时出错:', error);
    const statusCode = error.response?.status || 500;
    const errorMessage = error.message || '服务器内部错误';
    res.status(statusCode).json({
      error: errorMessage,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }
});

// 添加根路由处理
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Life Coach AI 助手后端服务运行正常',
    version: '0.0.1'
  });
});

// 启动服务器
app.listen(port, '127.0.0.1', () => {
  console.log(`服务器运行在 http://127.0.0.1:${port}`);
});