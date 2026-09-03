-- MySQL dump 10.13  Distrib 8.0.40, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: mindscribe
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `mindscribe`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `mindscribe` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `mindscribe`;

--
-- Table structure for table `attempts`
--

DROP TABLE IF EXISTS `attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attempts` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Attempt ID',
  `thread_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属 Thread',
  `attempt_no` int NOT NULL COMMENT 'Thread 内的尝试序号，从 1 开始',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending/running/succeeded/failed',
  `prompt` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '本次 Attempt 使用的用户提示词',
  `model_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型名称',
  `size` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '图片尺寸',
  `quality` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '图片质量',
  `output_format` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'png',
  `requested_count` tinyint NOT NULL DEFAULT '1' COMMENT '生成数量',
  `mode` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '模式',
  `results` json DEFAULT NULL COMMENT '生成结果 OSS 地址及元数据',
  `external_task_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '推理服务任务 ID',
  `error_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `runtime_metadata` json DEFAULT NULL COMMENT 'MLOps 运行元数据，如提供商、队列和耗时',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attempt_thread_no` (`thread_id`,`attempt_no`),
  UNIQUE KEY `uk_attempt_external_task` (`external_task_id`),
  KEY `idx_attempts_thread_created` (`thread_id`,`created_at`),
  KEY `idx_attempts_status_created` (`status`,`created_at`),
  CONSTRAINT `fk_attempts_thread` FOREIGN KEY (`thread_id`) REFERENCES `threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attempts`
--

LOCK TABLES `attempts` WRITE;
/*!40000 ALTER TABLE `attempts` DISABLE KEYS */;
INSERT INTO `attempts` VALUES ('066876f5-39d1-4f1f-ae77-0dacfaf31044','430d7679-1ecb-4600-8914-3d209cbf92fb',4,'succeeded','将参考图像中的主体，转化为一幅可爱、古怪的手绘涂鸦插画。\r\n\r\n采用极简的儿童故事书 / 时装速写美学，使用松散、不完美的黑色墨水线条，可见的铅笔涂鸦笔触，细微的交叉排线，以及迷人的手工质感。在保持参考图像中人物可识别的面部特征、发型、脸型、服饰、配饰和整体身份的同时，将它们简化成一个可爱的插图角色。\r\n\r\n角色设计：\r\n\r\n大脑袋和简化的小身体\r\n\r\n简单的点状眼睛和极小的嘴巴\r\n\r\n柔和圆润的面部特征\r\n\r\n脸颊上淡淡的粉红色红晕\r\n\r\n凌乱、富有表现力的手绘头发，带有许多松散的素描线\r\n\r\n略微夸张、好玩的形体比例\r\n\r\n自然放松的姿势，带有奇思妙想的时装插画感\r\n\r\n艺术风格：\r\n\r\n黑白铅笔 / 墨水涂鸦\r\n\r\n粗糙、不完美的素描线，而非干净的数字描边\r\n\r\n密集的涂鸦式头发和衣物细节\r\n\r\n浅淡的手绘色彩点缀\r\n\r\n微妙的水彩 / 蜡笔质感上色\r\n\r\n极简的明暗处理\r\n\r\n白色或米白色干净背景\r\n\r\n大量留白\r\n\r\n可爱、天真、俏皮、舒适的美学\r\n\r\n看起来像原创的手工笔记本 / 时尚涂鸦插画\r\n\r\n保留参考图像中的重要细节，同时将所有内容转化为一致的涂鸦风格。最终图像应呈现手绘感、略显不完美、讨喜、富有表现力且毫不费力的时尚感，而不是精致的矢量图或3D卡通。','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/211432_d3f79cd13cf3493d8971c87e7f527ed0.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','ad278daada7d4098957f9b1af5e8cf86',NULL,NULL,NULL,'2026-08-30 21:13:42.022',NULL,NULL,'2026-08-30 21:14:34.557'),('118128bd-faa5-4e1d-a440-392272818bd3','fa8f3af9-0c43-4e48-98d5-202856b8e52d',2,'succeeded','{\"system_prompt\":\"你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。\",\"user_prompt\":\"为长沙创作一幅温暖、友好的编辑式旅行插画。强调至少要有[橘子洲头.png]和[天心阁.png]\",\"references\":[\"橘子洲头.png\",\"天心阁.png\"],\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"长沙的地标建筑、特色街景、当地交通、自然景观、植物、动物、美食与文化物件\"},{\"tag_name\":\"主体数量\",\"tag_value\":\"各元素自然组合并适度重叠，保持疏朗通透\"},{\"tag_name\":\"构图方式\",\"tag_value\":\"平衡的编辑式构图，类似旅行手账或设计师速写本\"},{\"tag_name\":\"主体位置\",\"tag_value\":\"主体元素分散布局，避免集中堆叠\"},{\"tag_name\":\"留白空间\",\"tag_value\":\"大面积留白，每个元素保持呼吸感\"},{\"tag_name\":\"场景地点\",\"tag_value\":\"长沙\"},{\"tag_name\":\"背景内容\",\"tag_value\":\"简洁留白背景，不绘制复杂城市全景\"},{\"tag_name\":\"整体风格\",\"tag_value\":\"手绘旅行手账、精品旅行指南、当代杂志插画\"},{\"tag_name\":\"参考流派\",\"tag_value\":\"编辑式旅行插画、极简涂鸦\"},{\"tag_name\":\"媒介形式\",\"tag_value\":\"黑色毡尖笔\"},{\"tag_name\":\"渲染方式\",\"tag_value\":\"扁平化绘制，简化形状，极少内部细节\"},{\"tag_name\":\"笔触质感\",\"tag_value\":\"线条略微摇晃，粗细自然变化，松弛随性，保留手绘瑕疵\"},{\"tag_name\":\"整体色调\",\"tag_value\":\"黑白为主\"},{\"tag_name\":\"色彩倾向\",\"tag_value\":\"仅使用一种强调色 黑色\"},{\"tag_name\":\"色彩饱和度\",\"tag_value\":\"强调色低面积、克制使用\"},{\"tag_name\":\"光线质感\",\"tag_value\":\"平面照明，无渐变与高光\"},{\"tag_name\":\"情绪基调\",\"tag_value\":\"温暖、友好、轻松、俏皮、简约、优雅\"},{\"tag_name\":\"细节要求\",\"tag_value\":\"强调 长沙最具辨识度的文化与地域特征；线条自然断开、偶有重叠，体现手工绘制的不完美；强调色仅用于水面、天空、窗户、招牌、服饰点缀、装饰高光或少量建筑细节\"},{\"tag_name\":\"负面元素\",\"tag_value\":\"避免写实城市景观、照片感、3D效果、渐变、厚重阴影、油画笔触、复杂纹理、金属光泽、机械精确轮廓、矢量风格、过度细节、拥挤构图、额外颜色\"},{\"tag_name\":\"输出质量\",\"tag_value\":\"干净、通透、平面化、图形感强，突出手工毡尖笔涂鸦质感\"}]}','gpt-image-2','auto','auto','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/09/02/112210_fc2dddedca974520826f6a9cda8d0eac.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','f572982e6bc947218e3dfd3dc2c762ed',NULL,NULL,NULL,'2026-09-02 11:21:00.300',NULL,NULL,'2026-09-02 11:29:55.098'),('2b4e4aff-dd6a-4a8b-8db0-2214494d7c95','fa8f3af9-0c43-4e48-98d5-202856b8e52d',3,'failed','{\"system_prompt\":\"你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。\",\"user_prompt\":\"为长沙创作一幅温暖、友好的编辑式旅行插画。强调至少要有[橘子洲头.png]和[天心阁.png]\",\"references\":[\"橘子洲头.png\",\"天心阁.png\"],\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"长沙的地标建筑、特色街景、当地交通、自然景观、植物、动物、美食与文化物件\"},{\"tag_name\":\"主体数量\",\"tag_value\":\"各元素自然组合并适度重叠，保持疏朗通透\"},{\"tag_name\":\"构图方式\",\"tag_value\":\"平衡的编辑式构图，类似旅行手账或设计师速写本\"},{\"tag_name\":\"主体位置\",\"tag_value\":\"主体元素分散布局，避免集中堆叠\"},{\"tag_name\":\"留白空间\",\"tag_value\":\"大面积留白，每个元素保持呼吸感\"},{\"tag_name\":\"场景地点\",\"tag_value\":\"长沙\"},{\"tag_name\":\"背景内容\",\"tag_value\":\"简洁留白背景，不绘制复杂城市全景\"},{\"tag_name\":\"整体风格\",\"tag_value\":\"手绘旅行手账、精品旅行指南、当代杂志插画\"},{\"tag_name\":\"参考流派\",\"tag_value\":\"编辑式旅行插画、极简涂鸦\"},{\"tag_name\":\"媒介形式\",\"tag_value\":\"黑色毡尖笔\"},{\"tag_name\":\"渲染方式\",\"tag_value\":\"扁平化绘制，简化形状，极少内部细节\"},{\"tag_name\":\"笔触质感\",\"tag_value\":\"线条略微摇晃，粗细自然变化，松弛随性，保留手绘瑕疵\"},{\"tag_name\":\"整体色调\",\"tag_value\":\"黑白为主\"},{\"tag_name\":\"色彩倾向\",\"tag_value\":\"仅使用一种强调色 黑色\"},{\"tag_name\":\"色彩饱和度\",\"tag_value\":\"强调色低面积、克制使用\"},{\"tag_name\":\"光线质感\",\"tag_value\":\"平面照明，无渐变与高光\"},{\"tag_name\":\"情绪基调\",\"tag_value\":\"温暖、友好、轻松、俏皮、简约、优雅\"},{\"tag_name\":\"细节要求\",\"tag_value\":\"强调 长沙最具辨识度的文化与地域特征；线条自然断开、偶有重叠，体现手工绘制的不完美；强调色仅用于水面、天空、窗户、招牌、服饰点缀、装饰高光或少量建筑细节\"},{\"tag_name\":\"负面元素\",\"tag_value\":\"避免写实城市景观、照片感、3D效果、渐变、厚重阴影、油画笔触、复杂纹理、金属光泽、机械精确轮廓、矢量风格、过度细节、拥挤构图、额外颜色\"},{\"tag_name\":\"输出质量\",\"tag_value\":\"干净、通透、平面化、图形感强，突出手工毡尖笔涂鸦质感\"}]}','gpt-image-2','auto','auto','png',1,'image-to-image','[]','191d80dbbb954b39ae442882e3ebc6e8',NULL,'Request timed out.',NULL,'2026-09-02 11:29:37.022','2026-09-02 11:29:42.155','2026-09-02 11:29:55.109','2026-09-02 11:29:55.110'),('316bfe3b-c450-4015-8cbd-a0cf158bbd8c','430d7679-1ecb-4600-8914-3d209cbf92fb',2,'succeeded','将参考图像中的主体，转化为一幅可爱、古怪的手绘涂鸦插画。\r\n\r\n采用极简的儿童故事书 / 时装速写美学，使用松散、不完美的黑色墨水线条，可见的铅笔涂鸦笔触，细微的交叉排线，以及迷人的手工质感。在保持参考图像中人物可识别的面部特征、发型、脸型、服饰、配饰和整体身份的同时，将它们简化成一个可爱的插图角色。\r\n\r\n角色设计：\r\n\r\n大脑袋和简化的小身体\r\n\r\n简单的点状眼睛和极小的嘴巴\r\n\r\n柔和圆润的面部特征\r\n\r\n脸颊上淡淡的粉红色红晕\r\n\r\n凌乱、富有表现力的手绘头发，带有许多松散的素描线\r\n\r\n略微夸张、好玩的形体比例\r\n\r\n自然放松的姿势，带有奇思妙想的时装插画感\r\n\r\n艺术风格：\r\n\r\n黑白铅笔 / 墨水涂鸦\r\n\r\n粗糙、不完美的素描线，而非干净的数字描边\r\n\r\n密集的涂鸦式头发和衣物细节\r\n\r\n浅淡的手绘色彩点缀\r\n\r\n微妙的水彩 / 蜡笔质感上色\r\n\r\n极简的明暗处理\r\n\r\n白色或米白色干净背景\r\n\r\n大量留白\r\n\r\n可爱、天真、俏皮、舒适的美学\r\n\r\n看起来像原创的手工笔记本 / 时尚涂鸦插画\r\n\r\n保留参考图像中的重要细节，同时将所有内容转化为一致的涂鸦风格。最终图像应呈现手绘感、略显不完美、讨喜、富有表现力且毫不费力的时尚感，而不是精致的矢量图或3D卡通。','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/210724_5a046110edab4ea9981e8af0e11f041d.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','f6ea7d895b0940819ab7e018ffcbe644',NULL,NULL,NULL,'2026-08-30 21:06:34.993',NULL,NULL,'2026-08-30 21:14:34.546'),('7d05e0de-ff97-4514-b4aa-0ac7d868cdc8','430d7679-1ecb-4600-8914-3d209cbf92fb',3,'succeeded','将参考图像中的主体，转化为一幅可爱、古怪的手绘涂鸦插画。\r\n\r\n采用极简的儿童故事书 / 时装速写美学，使用松散、不完美的黑色墨水线条，可见的铅笔涂鸦笔触，细微的交叉排线，以及迷人的手工质感。在保持参考图像中人物可识别的面部特征、发型、脸型、服饰、配饰和整体身份的同时，将它们简化成一个可爱的插图角色。\r\n\r\n角色设计：\r\n\r\n大脑袋和简化的小身体\r\n\r\n简单的点状眼睛和极小的嘴巴\r\n\r\n柔和圆润的面部特征\r\n\r\n脸颊上淡淡的粉红色红晕\r\n\r\n凌乱、富有表现力的手绘头发，带有许多松散的素描线\r\n\r\n略微夸张、好玩的形体比例\r\n\r\n自然放松的姿势，带有奇思妙想的时装插画感\r\n\r\n艺术风格：\r\n\r\n黑白铅笔 / 墨水涂鸦\r\n\r\n粗糙、不完美的素描线，而非干净的数字描边\r\n\r\n密集的涂鸦式头发和衣物细节\r\n\r\n浅淡的手绘色彩点缀\r\n\r\n微妙的水彩 / 蜡笔质感上色\r\n\r\n极简的明暗处理\r\n\r\n白色或米白色干净背景\r\n\r\n大量留白\r\n\r\n可爱、天真、俏皮、舒适的美学\r\n\r\n看起来像原创的手工笔记本 / 时尚涂鸦插画\r\n\r\n保留参考图像中的重要细节，同时将所有内容转化为一致的涂鸦风格。最终图像应呈现手绘感、略显不完美、讨喜、富有表现力且毫不费力的时尚感，而不是精致的矢量图或3D卡通。','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/211129_ba778c5185624358a7ab74c04000af84.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','5d7b5d3284634a1bb4b57a93e85eaa47',NULL,NULL,NULL,'2026-08-30 21:10:29.125',NULL,NULL,'2026-08-30 21:14:34.552'),('aed8f434-61d5-4382-88ad-e993b91ee0e2','430d7679-1ecb-4600-8914-3d209cbf92fb',1,'succeeded','将参考图像中的主体，转化为一幅可爱、古怪的手绘涂鸦插画。\r\n\r\n采用极简的儿童故事书 / 时装速写美学，使用松散、不完美的黑色墨水线条，可见的铅笔涂鸦笔触，细微的交叉排线，以及迷人的手工质感。在保持参考图像中人物可识别的面部特征、发型、脸型、服饰、配饰和整体身份的同时，将它们简化成一个可爱的插图角色。\r\n\r\n角色设计：\r\n\r\n大脑袋和简化的小身体\r\n\r\n简单的点状眼睛和极小的嘴巴\r\n\r\n柔和圆润的面部特征\r\n\r\n脸颊上淡淡的粉红色红晕\r\n\r\n凌乱、富有表现力的手绘头发，带有许多松散的素描线\r\n\r\n略微夸张、好玩的形体比例\r\n\r\n自然放松的姿势，带有奇思妙想的时装插画感\r\n\r\n艺术风格：\r\n\r\n黑白铅笔 / 墨水涂鸦\r\n\r\n粗糙、不完美的素描线，而非干净的数字描边\r\n\r\n密集的涂鸦式头发和衣物细节\r\n\r\n浅淡的手绘色彩点缀\r\n\r\n微妙的水彩 / 蜡笔质感上色\r\n\r\n极简的明暗处理\r\n\r\n白色或米白色干净背景\r\n\r\n大量留白\r\n\r\n可爱、天真、俏皮、舒适的美学\r\n\r\n看起来像原创的手工笔记本 / 时尚涂鸦插画\r\n\r\n保留参考图像中的重要细节，同时将所有内容转化为一致的涂鸦风格。最终图像应呈现手绘感、略显不完美、讨喜、富有表现力且毫不费力的时尚感，而不是精致的矢量图或3D卡通。','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/210436_06f5a577106841f88ccf61f9b329d94a.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','ac694e0bead9447fba88155b6bb5d3f6',NULL,NULL,NULL,'2026-08-30 21:03:51.160',NULL,NULL,'2026-08-30 21:14:34.539'),('b2785198-31da-4bd8-a7d6-9c4a347db888','8502450e-b6a2-422a-bea8-aeab580cfdbe',1,'succeeded','{\"system_prompt\":\"你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。\",\"user_prompt\":\"帮我构建一张有趣的动画图,人物原型是[薛之谦.jpg]\",\"references\":[\"薛之谦.jpg\"],\"tags_prompt\":[{\"tag_name\":\"整体风格\",\"tag_value\":\"混乱搞笑的低技巧手绘涂鸦，像用廉价马克笔或蜡笔快速画成\"},{\"tag_name\":\"表情状态\",\"tag_value\":\"夸张五官与笨拙比例，保留人物辨识度，歪眼、大头、小身体、滑稽表情\"},{\"tag_name\":\"笔触质感\",\"tag_value\":\"粗糙抖动的儿童画线条，潦草涂改、重叠轮廓、随意 scribble 和意外笔触\"},{\"tag_name\":\"背景内容\",\"tag_value\":\"简化且透视歪斜的建筑、树木、云朵和街道，加入箭头、星星、旋涡和小字涂鸦\"},{\"tag_name\":\"细节要求\",\"tag_value\":\"随意不均匀的填色，蜡笔纹理、马克笔渗色、纸张颗粒和不规则阴影，整体荒诞活泼、故意不精致\"}]}','gpt-image-2','auto','auto','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/09/01/231002_56f3df624a344fc8854a1fd252628730.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','1ef32c69ac2d4bb0a57a87830ab3c9c7',NULL,NULL,NULL,'2026-09-01 23:08:35.532',NULL,NULL,'2026-09-01 23:10:05.218'),('c12eaf39-363d-4869-bb15-261db4b5aee3','fa8f3af9-0c43-4e48-98d5-202856b8e52d',1,'succeeded','{\"system_prompt\":\"你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。\",\"user_prompt\":\"为长沙创作一幅温暖、友好的编辑式旅行插画。强调至少要有[橘子洲头.png]和[天心阁.png]\",\"references\":[\"橘子洲头.png\",\"天心阁.png\"],\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"长沙的地标建筑、特色街景、当地交通、自然景观、植物、动物、美食与文化物件\"},{\"tag_name\":\"主体数量\",\"tag_value\":\"各元素自然组合并适度重叠，保持疏朗通透\"},{\"tag_name\":\"构图方式\",\"tag_value\":\"平衡的编辑式构图，类似旅行手账或设计师速写本\"},{\"tag_name\":\"主体位置\",\"tag_value\":\"主体元素分散布局，避免集中堆叠\"},{\"tag_name\":\"留白空间\",\"tag_value\":\"大面积留白，每个元素保持呼吸感\"},{\"tag_name\":\"场景地点\",\"tag_value\":\"长沙\"},{\"tag_name\":\"背景内容\",\"tag_value\":\"简洁留白背景，不绘制复杂城市全景\"},{\"tag_name\":\"整体风格\",\"tag_value\":\"手绘旅行手账、精品旅行指南、当代杂志插画\"},{\"tag_name\":\"参考流派\",\"tag_value\":\"编辑式旅行插画、极简涂鸦\"},{\"tag_name\":\"媒介形式\",\"tag_value\":\"黑色毡尖笔\"},{\"tag_name\":\"渲染方式\",\"tag_value\":\"扁平化绘制，简化形状，极少内部细节\"},{\"tag_name\":\"笔触质感\",\"tag_value\":\"线条略微摇晃，粗细自然变化，松弛随性，保留手绘瑕疵\"},{\"tag_name\":\"整体色调\",\"tag_value\":\"黑白为主\"},{\"tag_name\":\"色彩倾向\",\"tag_value\":\"仅使用一种强调色 黑色\"},{\"tag_name\":\"色彩饱和度\",\"tag_value\":\"强调色低面积、克制使用\"},{\"tag_name\":\"光线质感\",\"tag_value\":\"平面照明，无渐变与高光\"},{\"tag_name\":\"情绪基调\",\"tag_value\":\"温暖、友好、轻松、俏皮、简约、优雅\"},{\"tag_name\":\"细节要求\",\"tag_value\":\"强调 长沙最具辨识度的文化与地域特征；线条自然断开、偶有重叠，体现手工绘制的不完美；强调色仅用于水面、天空、窗户、招牌、服饰点缀、装饰高光或少量建筑细节\"},{\"tag_name\":\"负面元素\",\"tag_value\":\"避免写实城市景观、照片感、3D效果、渐变、厚重阴影、油画笔触、复杂纹理、金属光泽、机械精确轮廓、矢量风格、过度细节、拥挤构图、额外颜色\"},{\"tag_name\":\"输出质量\",\"tag_value\":\"干净、通透、平面化、图形感强，突出手工毡尖笔涂鸦质感\"}]}','gpt-image-2','auto','auto','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/09/01/205916_ea31f5383ec24445aa2efe8dbff4dabb.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','ad2bf756bff64c2aa71f986101e8ef77',NULL,NULL,NULL,'2026-09-01 20:58:18.190',NULL,NULL,'2026-09-01 20:59:18.220'),('d6832cf5-a456-11f1-9a95-40c2ba597463','d68014a4-a456-11f1-9a95-40c2ba597463',1,'succeeded','夕阳下的校园一角，温暖的橙黄色光线，安静的电影感构图。','gpt-image-2','1024x1024','standard','png',1,'text-to-image','[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/145915_e824df17fc5149ceb572fe9013334be5.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','mock-task-d6898c33-a456-11f1-9a95-40c2ba597463',NULL,NULL,'{\"provider\": \"mock\", \"queueTimeMs\": 0, \"totalTimeMs\": 12000, \"inferenceTimeMs\": 12000}','2026-08-30 17:40:29.865','2026-08-30 17:40:29.865','2026-08-30 17:40:29.865','2026-08-30 18:42:28.590'),('d8f4c1d9-83c7-4691-a8e6-94e92cda0e39','ae530508-f338-46e4-8b98-41eff31714ef',1,'succeeded','将这张照片变成一幅混乱有趣的涂鸦插画，刻意画得凌乱且技法拙劣，仿佛是用廉价记号笔、蜡笔或磨损的毡头笔在纸上快速勾勒出来的。\r\n\r\n夸张的面部特征要带有笨拙的比例——夸张的表情，过大的脑袋、极小的身体、歪斜的笑容，以及笨手笨脚的人体结构，但依然要能认出画的是谁。用粗糙的、像小孩乱涂的线条，颤抖的手绘笔触，明显的涂改痕迹，重叠的轮廓，偶然蹭出的墨点，以及在画面四周随意添加的涂鸦。背景采用简单的卡通风格，但画得歪歪扭扭，有糟糕的建筑、树木、云朵、街道元素，以及毫无章法的透视。上色要看起来漫不经心且不完美，带有明显的笔触纹理、不均匀的填色区域、蜡笔的颗粒质感、马克笔的晕染效果，以及不规则的明暗处理。加入一些俏皮的瑕疵，比如被划掉的线条、未完成的细节、随意的箭头、小字注释、星星、漩涡纹样和抽象的乱涂。整体美学风格应显得幽默、即兴、手作感强、充满活力、滑稽可笑，并且刻意保持粗糙感，像是儿童素描本与无厘头网络梗图的混合体。要有丰富的纹理细节，可见的纸张颗粒，不对称的构图，别扭的画面取景，表现力十足的涂鸦混乱，以及原生态的速写能量。','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/202300_7c402fcc1c4a48398961e7d3c575fdb0.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','62dd902a21244c1b9155b54401b9bacc',NULL,NULL,NULL,'2026-08-30 20:21:45.916',NULL,NULL,'2026-08-30 20:37:13.054'),('eaec1d48-fec9-41fc-94b8-87dbfb090277','85d094a7-a20f-4b4e-bfee-847cf03a76f2',1,'succeeded','Turn the reference photo into a travel souvenir enamel pin badge. Compose it as a SCENE, not a single isolated object.\r\n\r\nSubject hierarchy: the defining landscape, terrain or landmark of the photo forms the main body of the badge and occupies most of its area. If a person appears prominently in the photo, keep them in the badge as a small, simplified figure at true relative scale within that landscape — the person is an accent, the landscape is the subject. Preserve the original spatial relationship and scale between the figure and the surroundings.\r\n\r\nHow to render the person: flat enamel color blocks matching their real clothing and hair color from the photo. The face is a smooth plain area of light skin-tone enamel with no drawn facial features — do NOT render the person as a dark or black silhouette, and do NOT black out the face or head. Skin reads as a warm light enamel color, clearly lighter than the clothing.\r\n\r\nStyling: thin polished gold outline around the silhouette and along every internal divider, glossy enamel color fill, gentle even lighting with only a soft sheen on the gold lines, very subtle drop shadow. Outer contour follows the scene\'s own shape, not a plain rectangle.\r\n\r\nBackground: flat dark navy coarse linen texture. Badge centered, filling about 60% of the frame.\r\n\r\nAvoid: black silhouette figure, blacked-out face, dark featureless head, portrait close-up, detailed facial features, person dominating the badge, cropping out the landscape, three-quarter angle, macro product photography, heavy specular glare, cartoon, realistic scene, text, watermark.','gpt-image-2','1024x1024','medium','png',1,NULL,'[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/generated-images/2026/08/30/201908_b02b720484a9466dbb7397559bc7fea5.png\", \"mimeType\": \"image/png\", \"sortOrder\": 1}]','e4d11107693e4918b34c920b5fb4a87a',NULL,NULL,NULL,'2026-08-30 20:17:40.304',NULL,NULL,'2026-08-30 20:19:26.937');
/*!40000 ALTER TABLE `attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `threads`
--

DROP TABLE IF EXISTS `threads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `threads` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Thread ID',
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属用户',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '创作标题',
  `reference_images` json DEFAULT NULL COMMENT 'Thread 创建时上传的参考图 OSS 地址及元数据',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending/running/succeeded/failed',
  `attempt_count` int NOT NULL DEFAULT '0' COMMENT '尝试次数',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `archived_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_threads_user_updated` (`user_id`,`updated_at`),
  KEY `idx_threads_user_status` (`user_id`,`status`),
  CONSTRAINT `fk_threads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `threads`
--

LOCK TABLES `threads` WRITE;
/*!40000 ALTER TABLE `threads` DISABLE KEYS */;
INSERT INTO `threads` VALUES ('430d7679-1ecb-4600-8914-3d209cbf92fb','1834b0ad-a44a-11f1-9a95-40c2ba597463','薛之谦呆萌图','[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/reference-images/2026/08/30/397127be354142dba9a2b2c0c7884f33-995891fbe71c999dbd7079c2b09c23ce.jpg\", \"filename\": \"995891fbe71c999dbd7079c2b09c23ce.jpg\", \"mimeType\": \"image/jpeg\"}]','succeeded',4,'2026-08-30 21:03:51.154','2026-09-01 22:33:05.803',NULL),('8502450e-b6a2-422a-bea8-aeab580cfdbe','1834b0ad-a44a-11f1-9a95-40c2ba597463','26-09-01任务2','[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/reference-images/2026/09/01/1db5cdf3c43a4344bcce7019c2415cc7-薛之谦.jpg\", \"filename\": \"薛之谦.jpg\", \"mimeType\": \"image/jpeg\"}]','succeeded',1,'2026-09-01 23:08:35.521','2026-09-01 23:10:05.223',NULL),('85d094a7-a20f-4b4e-bfee-847cf03a76f2','1834b0ad-a44a-11f1-9a95-40c2ba597463','26-08-30任务5','[]','succeeded',1,'2026-08-30 20:17:40.296','2026-08-30 20:19:26.944',NULL),('ae530508-f338-46e4-8b98-41eff31714ef','1834b0ad-a44a-11f1-9a95-40c2ba597463','26-08-30任务6','[]','succeeded',1,'2026-08-30 20:21:45.911','2026-08-30 20:37:13.060',NULL),('d68014a4-a456-11f1-9a95-40c2ba597463','1834b0ad-a44a-11f1-9a95-40c2ba597463','夕阳徽章','[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/reference-images/2026/08/30/76d834c870264bebbf1efb15968bfcff-%E5%A4%95%E9%98%B31.jpg\", \"filename\": \"夕阳2.jpg\", \"mimeType\": \"image/jpeg\"}]','succeeded',1,'2026-08-30 17:40:29.841','2026-08-30 19:24:43.345',NULL),('fa8f3af9-0c43-4e48-98d5-202856b8e52d','1834b0ad-a44a-11f1-9a95-40c2ba597463','26-09-01任务1','[{\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/reference-images/2026/09/01/9c0c7e698dfc4ca9b655fbc6297cbf6c-橘子洲头.png\", \"filename\": \"橘子洲头.png\", \"mimeType\": \"image/png\"}, {\"url\": \"https://mind-scribe.oss-cn-guangzhou.aliyuncs.com/reference-images/2026/09/01/ea66b811451243c8893835f876bf61e2-天心阁.png\", \"filename\": \"天心阁.png\", \"mimeType\": \"image/png\"}]','failed',3,'2026-09-01 20:58:18.181','2026-09-02 11:29:55.116',NULL);
/*!40000 ALTER TABLE `threads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户 ID',
  `username` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录用户名',
  `email` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '密码哈希',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '展示名称',
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '头像地址',
  `role` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT 'user/admin',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `credit_balance` int NOT NULL DEFAULT '0' COMMENT '算力余额',
  `settings` json DEFAULT NULL COMMENT '个人设置',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `last_login_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('1834b0ad-a44a-11f1-9a95-40c2ba597463','admin','admin@exam.com','$2b$12$u/W8vDz8cUKyR4xMFt1Ydem3XVzNnTN9dENY4M363TBUV/3Zj3o4S','系统管理员',NULL,'admin','active',0,'{\"remix\": false, \"public\": false, \"downloads\": false, \"revealPrompt\": false}','2026-08-30 16:09:16.558','2026-09-02 11:19:36.897','2026-09-02 11:19:36.897'),('85b48a60-1715-42f8-b4b1-5c223b6a9c1a','usera@exam.com','usera@exam.com','$2a$10$Cf8AAdp6.SnBTNw8MGDI5Of.KQNyeTb35j.FT8ZwfJk.Zievm47Nm','userA',NULL,'user','active',300,NULL,'2026-09-02 09:48:06.045','2026-09-02 09:57:33.839','2026-09-02 09:57:33.839'),('f77171fc-7893-4236-9fef-49ef33c8650b','userb@exam.com','userb@exam.com','$2a$10$kU2I3q7fda8cQ7IBPcGiuuwzyb.z4Fk8HAFQm4mT3VQsj73iDvbee','userB',NULL,'user','active',300,NULL,'2026-09-02 09:56:11.319','2026-09-02 10:37:03.055','2026-09-02 10:37:03.055');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'mindscribe'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-02 17:44:26
