import { useState } from 'react';

class ApiClient {
  constructor(baseURL, maxRetries = 3, retryDelay = 1000) {
    this.baseURL = baseURL;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async fetchWithRetry(url, options, retryCount = 0) {
    try {
      const response = await fetch(this.baseURL + url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log(`请求失败，${this.retryDelay / 1000}秒后进行第${retryCount + 1}次重试...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      throw new Error(`请求失败，已重试${this.maxRetries}次: ${error.message}`);
    }
  }

  async streamWithRetry(url, options, onData, onError, retryCount = 0) {
    try {
      const response = await this.fetchWithRetry(url, options);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        onData(chunk);
      }
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log(`流式请求失败，${this.retryDelay / 1000}秒后进行第${retryCount + 1}次重试...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.streamWithRetry(url, options, onData, onError, retryCount + 1);
      }
      onError(error);
    }
  }

  // 手动重试当前请求
  async retryCurrentRequest(requestConfig) {
    const { url, options, onData, onError } = requestConfig;
    if (options.stream) {
      return this.streamWithRetry(url, options, onData, onError);
    }
    return this.fetchWithRetry(url, options);
  }
}

// 创建API客户端实例
const apiClient = new ApiClient('http://localhost:8080');

// 自定义Hook用于管理API请求状态
export const useApiRequest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendRequest = async (url, options = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.fetchWithRetry(url, options);
      setIsLoading(false);
      return response;
    } catch (err) {
      setError(err);
      setIsLoading(false);
      throw err;
    }
  };

  const sendStreamRequest = async (url, options = {}, onData) => {
    setIsLoading(true);
    setError(null);

    await apiClient.streamWithRetry(
      url,
      options,
      (chunk) => {
        onData(chunk);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      }
    );

    setIsLoading(false);
  };

  const retryRequest = async (requestConfig) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await apiClient.retryCurrentRequest(requestConfig);
      setIsLoading(false);
    } catch (err) {
      setError(err);
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    sendRequest,
    sendStreamRequest,
    retryRequest
  };
};

export default apiClient;