const hostname = window.location.hostname.toLowerCase();
const pageLanguage = document.documentElement.lang.toLowerCase();
const useChinese =
  hostname === "icdesign.com" ||
  hostname.endsWith(".icdesign.com") ||
  pageLanguage === "zh" ||
  pageLanguage.startsWith("zh-");

export const embeddedCopy = useChinese
  ? {
      cancel: "取消",
      colorNames: ["粉色", "橙色", "黄色", "绿色", "蓝色", "紫色"],
      delete: "删除",
      deleteDescription: "删除后将从所有同步设备中移除，且无法撤销。",
      deleteError: "删除失败，请检查网络后重试。",
      deleteHighlight: "删除高亮",
      deleteTitle: "删除高亮？",
      deleteWithNote: "这条高亮及其笔记将从所有同步设备中移除，且无法撤销。",
      deleting: "删除中…",
      editNote: "编辑笔记",
      highlightActions: "高亮操作",
      highlightColor: (name) => `使用${name}高亮`,
      highlightColors: "选择高亮颜色",
      noteLabel: "笔记内容",
      notePlaceholder: "记录你的想法",
      save: "保存",
      saveError: "保存失败，请检查网络后重试。",
      saving: "保存中…",
    }
  : {
      cancel: "Cancel",
      colorNames: ["Rose", "Amber", "Yellow", "Green", "Blue", "Violet"],
      delete: "Delete",
      deleteDescription:
        "This removes the highlight from every synced browser and cannot be undone.",
      deleteError: "The highlight could not be deleted. Please try again.",
      deleteHighlight: "Delete highlight",
      deleteTitle: "Delete highlight?",
      deleteWithNote:
        "This removes the highlight and its note from every synced browser and cannot be undone.",
      deleting: "Deleting…",
      editNote: "Edit note",
      highlightActions: "Highlight actions",
      highlightColor: (name) => `Highlight in ${name}`,
      highlightColors: "Highlight colors",
      noteLabel: "Note",
      notePlaceholder: "Write a note",
      save: "Save",
      saveError: "The note could not be saved. Please try again.",
      saving: "Saving…",
    };
