export const GUIDE_HIDDEN_KEY = 'tongji-health-map:guide-hidden:v1';
export interface GuideSection { title: string; steps?: string[]; paragraphs?: string[]; groups?: { title: string; steps: string[] }[] }
interface GuideCopy { title: string; intro: string; contents: string; dontShow: string; close: string; sections: GuideSection[] }
export const guideCopy: Record<'zh' | 'en', GuideCopy> = {
  zh: {
    title: '使用说明', intro: '标注校园地点、记录路线，与大家分享你的健康生活地图。', contents: '使用说明正文', dontShow: '不再显示', close: '关闭',
    sections: [
      { title: '个人标注与备份', paragraphs: ['“我的标注”中的地点和路线保存在当前浏览器。换设备、换浏览器或清除网站数据后，不会自动同步。', '点击“导出备份”可保存 JSON 文件。“导入备份”会替换当前浏览器的全部个人标注，请先导出现有备份。'] },
      { title: '创建地点', steps: ['点击“标注地点”，再点击地图选择位置；也可搜索校园地点，选中结果后点击“确认并添加地点”。', '填写中文名称、选择资源类型，并按需补充英文名称、地址、开放时间、联系方式和说明。点击地图或拖动标记可调整位置。', '可点击“上传图片”添加地点照片：最多 6 张，每张不超过 5 MB，支持 JPG、PNG、WebP。上传完成后点击“保存”。'], paragraphs: ['点击已保存的地点可查看详情、编辑信息或移除图片。图片保存在又拍云，获得链接的人可以查看；备份保存图片引用，请勿上传私人资料。'] },
      { title: '创建路线', groups: [
        { title: '手绘路线', steps: ['点击“绘制路线”，沿途依次点击地图添加节点。“撤销一点”可移除最后一个节点。', '至少选择两个不同的位置，再点击“完成绘制”。填写路线名称和说明，点击“保存”。', '在路线详情点击“编辑”，可拖动节点调整路线，点击地图追加节点，再保存修改。'] },
        { title: '步行规划', steps: ['点击“步行规划”，在地图上选择起点和终点，也可选择已标注地点。', '点击“生成步行路线”查看预览，确认后点击“保存路线”，填写名称并点击“保存”。'] },
      ], paragraphs: ['规划失败可调整起终点重试，或点击“改为手绘路线”。手绘路线记录你选择的路径；自动规划依赖高德道路数据。编辑自动规划路线的节点后，会转为手绘路线并移除预计时间。'] },
      { title: '共享备份如何工作', steps: ['先保存个人地点和路线，再点击“上传共享备份”，填写“备份名称”和“创建者”，确认后上传。名称、创建者和标注将公开，任何人都可以查看和下载。', '进入“共享备份”，勾选备份即可在地图上显示；支持同时勾选多份，取消勾选可移除对应显示。', '共享备份以只读方式查看，不会覆盖“我的标注”。如需转为个人数据，可点击“下载 JSON”后导入；导入会替换当前个人标注，请先导出备份。'], paragraphs: ['共享备份是上传时已保存标注的快照，之后的个人修改不会自动更新已上传备份。地点图片的引用随备份保留。'] },
    ],
  },
  en: {
    title: 'User guide', intro: 'Mark campus places, record walks, and share your health map with others.', contents: 'User guide contents', dontShow: 'Don’t show again', close: 'Close',
    sections: [
      { title: 'Personal annotations and backups', paragraphs: ['Places and routes in “My annotations” are saved in this browser. They do not automatically sync when you change devices or browsers, or clear site data.', 'Use “Export backup” to keep a JSON file. “Import backup” replaces all personal annotations in this browser, so export your current backup first.'] },
      { title: 'Create a place', steps: ['Choose “Add place”, then click the map to select a position. You can also search for a campus place, select a result, and choose “Confirm and add place”.', 'Enter a Chinese name, choose a resource type, and optionally add an English name, address, opening hours, contact details and description. Click the map or drag the marker to adjust its position.', 'Use “Upload photos” to add up to 6 JPG, PNG or WebP photos, no larger than 5 MB each. Wait for uploads to finish, then choose “Save”.'], paragraphs: ['Select a saved place to view its details, edit it or remove photo references. Photos are stored in Upyun and anyone with a link can view them. Backups keep photo references; avoid uploading private information.'] },
      { title: 'Create a route', groups: [
        { title: 'Draw a route', steps: ['Choose “Draw route” and click the map along your path to add vertices. “Undo point” removes the last vertex.', 'Choose at least two different positions, then select “Finish drawing”. Enter a route name and description, then choose “Save”.', 'Select “Edit” in the route details to drag vertices or click the map to append another vertex, then save your changes.'] },
        { title: 'Plan a walk', steps: ['Choose “Plan a walk” and select a start and destination on the map, or choose saved places.', 'Choose “Generate walking route” to preview the result, then “Save route”. Enter a name and choose “Save”.'] },
      ], paragraphs: ['If planning fails, change the endpoints and retry, or choose “Draw route manually”. Manual routes record your chosen path; automatic plans depend on AMap road coverage. Editing the vertices of a planned route converts it to a manual route and removes the estimated time.'] },
      { title: 'How shared backups work', steps: ['Save your personal places and routes first, then choose “Upload shared backup”. Enter a “Backup name” and “Creator”, confirm and upload. The name, creator and annotations become public for anyone to view and download.', 'Open “Shared backups” and check a backup to show it on the map. You can select several at once; uncheck a backup to remove it from the view.', 'Shared backups are read-only and do not overwrite “My annotations”. To use one as personal data, choose “Download JSON” and import the file. Importing replaces your personal annotations, so export your current backup first.'], paragraphs: ['A shared backup is a snapshot of saved annotations at the time of upload. Later personal edits do not automatically update it. Place photo references are included in the backup.'] },
    ],
  },
};
