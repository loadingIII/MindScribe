export const image = (seed, width = 900, height = 1100) => `https://picsum.photos/seed/${seed}/${width}/${height}`;

export const starterPrompts = [
  { id: "p1", title: "潮汐肖像", source: "官方", category: "头像", tags: ["胶片", "自然光"], saved: true, prompt: "一张置身海风里的电影感人物肖像，35mm胶片颗粒，柔和侧光，低饱和青灰与珊瑚色。", cover: image("tide-portrait") },
  { id: "p2", title: "城市留白", source: "社区", category: "海报", tags: ["编辑感", "建筑"], saved: false, prompt: "现代城市建筑海报，强烈留白，纸张肌理，干净的排版区域，安静的光影。", cover: image("city-paper") },
  { id: "p3", title: "晚风壁纸", source: "官方", category: "壁纸", tags: ["氛围", "风景"], saved: false, prompt: "山脊上傍晚的风，极简色块与细腻颗粒，纵向手机壁纸构图。", cover: image("evening-ridge") },
  { id: "p4", title: "果汁明信片", source: "我的", category: "明信片", tags: ["插画", "夏日"], saved: true, prompt: "手绘水果明信片，明亮而克制的配色，铅笔线稿，阳光和小小的手写文字。", cover: image("fruit-postcard") },
  { id: "p5", title: "红色小报", source: "社区", category: "小红书插图", tags: ["版画", "人文"], saved: false, prompt: "红黑双色版画风插图，杂志小报排版，轻微失真和高反差。", cover: image("red-editorial") },
  { id: "p6", title: "柔软的花", source: "我的", category: "插画", tags: ["水彩", "花卉"], saved: false, prompt: "潮湿水彩纸上的花朵，花瓣边缘晕染，低对比度的清晨光线。", cover: image("soft-flower") }
];

export const starterWorks = [
  { id: "w1", title: "雨后花园", author: "林枝", authorId: "lin", avatar: image("avatar-lin", 120, 120), image: image("rain-garden"), likes: 1280, saved: false, liked: false, category: "插画", prompt: "雨后花园中的一把透明椅子，潮湿油画质感，柔和的蓝绿色。", model: "gpt-image-2", size: "1024×1536", comments: ["光线特别安静", "收藏了这个色调"] },
  { id: "w2", title: "南方来信", author: "Yun", authorId: "yun", avatar: image("avatar-yun", 120, 120), image: image("south-letter"), likes: 860, saved: true, liked: true, category: "明信片", prompt: "南方夏日的一封手写来信，柑橘色、墨绿和旧纸张纹理，摄影与拼贴。", model: "dall-e-3", size: "1024×1024", comments: ["像闻到了潮湿的风"] },
  { id: "w3", title: "夜班电台", author: "满月", authorId: "moon", avatar: image("avatar-moon", 120, 120), image: image("night-radio"), likes: 732, saved: false, liked: false, category: "海报", prompt: "深夜电台节目海报，黑白摄影，荧光绿文字，瑞士风格网格。", model: "gpt-image-2", size: "1536×1024", comments: [] },
  { id: "w4", title: "春日头像", author: "Nova", authorId: "nova", avatar: image("avatar-nova", 120, 120), image: image("spring-profile"), likes: 498, saved: false, liked: false, category: "头像", prompt: "春日阳光下的年轻人肖像，细腻胶片颗粒，素色衬衫，干净背景。", model: "dall-e-3", size: "1024×1024", comments: ["构图很舒服"] },
  { id: "w5", title: "漂浮的海", author: "Rui", authorId: "rui", avatar: image("avatar-rui", 120, 120), image: image("floating-sea"), likes: 1096, saved: true, liked: false, category: "壁纸", prompt: "漂浮在夜空里的海，超现实主义，蓝黑渐变，微光，纵向构图。", model: "gpt-image-2", size: "1024×1536", comments: [] }
];

export const starterLibrary = [
  { id: "l1", title: "雾中车站", image: image("fog-station"), status: "已完成", createdAt: "今天 09:42", prompt: "晨雾中的老车站，编辑感摄影，克制的暖光。", model: "gpt-image-2", versions: ["初稿", "提高对比", "最终交付"] },
  { id: "l2", title: "窗边的花", image: image("window-flowers"), status: "已完成", createdAt: "昨天 18:16", prompt: "午后窗边的花束，水彩和胶片结合。", model: "dall-e-3", versions: ["初稿", "增加留白"] },
  { id: "l3", title: "城市软着陆", image: image("soft-city"), status: "生成中", createdAt: "今天 10:05", prompt: "温和的未来城市，纸张质感。", model: "gpt-image-2", versions: ["初稿"] }
];
