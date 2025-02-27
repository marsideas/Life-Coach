// 导入必要的React依赖
// 这里因为使用React 18的新特性，所以从react-dom/client导入createRoot
import React from 'react'
import ReactDOM from 'react-dom/client'
// 导入根组件App和全局样式
// 这里导入App组件作为应用的根组件，index.css包含全局样式定义
import App from './App.jsx'
import './index.css'

// 使用React 18的createRoot API创建根节点
// 这里使用新的createRoot API替代旧的render方法，以支持并发渲染等新特性
ReactDOM.createRoot(document.getElementById('root')).render(
  // 启用严格模式
  // 这里使用React.StrictMode组件包裹应用，在开发环境下进行额外的检查和警告
  <React.StrictMode>
    <App />
  </React.StrictMode>
)