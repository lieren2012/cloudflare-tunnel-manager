import { defineConfig } from 'vitepress'

const REPO = 'https://github.com/lieren2012/cloudflare-tunnel-manager'

export default defineConfig({
  title: 'CF Tunnel Manager',
  description: 'Cloudflare Tunnel 多隧道管理面板 —— 单容器多隧道同时在线，Docker 一键部署',

  // 部署到 GitHub Pages 项目页时传 DOCS_BASE=/cloudflare-tunnel-manager/
  base: process.env.DOCS_BASE || '/',

  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#2563eb' }],
  ],

  markdown: {
    lineNumbers: true,
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'CF Tunnel Manager',

    nav: [
      { text: '指南', link: '/guide/', activeMatch: '/guide/' },
      { text: '获取凭据', link: '/get-credentials' },
      { text: '常见问题', link: '/guide/faq' },
      { text: 'GitHub', link: REPO },
    ],

    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '快速开始', link: '/guide/' },
          { text: '获取 Cloudflare 凭据', link: '/get-credentials' },
        ],
      },
      {
        text: '使用手册',
        items: [
          { text: '管理面板', link: '/guide/panel' },
          { text: '更新与国内加速', link: '/guide/update' },
          { text: '外部 API 与 MCP', link: '/guide/api' },
        ],
      },
      {
        text: '更多',
        items: [
          { text: '安全与公网暴露', link: '/guide/security' },
          { text: '常见问题', link: '/guide/faq' },
        ],
      },
    ],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清除查询条件',
            backButtonTitle: '返回',
            noResultsText: '没有找到相关结果',
            footer: {
              selectText: '选择',
              selectKeyAriaLabel: '选择',
              navigateText: '切换',
              navigateUpKeyAriaLabel: '上一条',
              navigateDownKeyAriaLabel: '下一条',
              closeText: '关闭',
              closeKeyAriaLabel: '关闭',
            },
          },
        },
      },
    },

    footer: {
      message: 'MIT License · 非 Cloudflare 官方项目',
      copyright: '仅用于个人学习与自用',
    },

    socialLinks: [{ icon: 'github', link: REPO }],
  },
})
