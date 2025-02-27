// 导入Vite的配置函数和React插件
// 这里使用defineConfig来获得类型提示
import { defineConfig } from 'vite'
// 导入React插件用于处理JSX转换
import react from '@vitejs/plugin-react'

// Vite配置文件
// 这里使用defineConfig导出配置对象，以获得更好的类型提示
export default defineConfig({
  // 配置插件
  // 这里因为是React项目，所以需要添加React插件来处理JSX
  plugins: [react()],
  
  // 配置基础公共路径
  // 这里设置为'/'表示使用相对路径，适合部署在任何路径下
  base: '/',
  
  // 开发服务器配置
  // 这里配置开发服务器的端口和主机
  server: {
    port: 8080,
    host: 'localhost'
  },
  
  // 构建配置
  // 这里配置生产环境构建的相关选项
  build: {
    // 指定构建输出目录
    outDir: 'dist',
    // 生成sourcemap便于调试
    sourcemap: true,
    // Rollup构建配置
    rollupOptions: {
      output: {
        // 手动分块配置
        // 这里将React相关库单独打包，优化加载性能
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  }
})