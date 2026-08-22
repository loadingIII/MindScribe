from libs.store.service import OSSService

oss = OSSService()

oss.upload_file(
    file_path="E:\project\MindScribe\exp\gen_img_demo\output\output_20260822_142447_706.png",
    prefix="test/img",
    content_type="image/png")
