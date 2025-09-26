const escapeFilename = (name) =>
  name.replace(/[\\?%*:|"<>`]/g, (it) => "`" + it.charCodeAt().toString(16));

const loadImages = async (tab) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const scrollHeight = document.body.scrollHeight;
      const height = window.innerHeight;
      for (let i = 0; i < Math.ceil(scrollHeight / height); i++) {
        window.scrollTo(0, i * height);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      window.scrollTo(0, 0);
    },
  });
  await result;
};

const saveMhtml = async (tab) => {
  const date = new Date().toISOString().replace(/-|T|:|\..+/g, "");
  console.log(date, "save", tab.url);

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.downloads.download({
      url: reader.result,
      filename: `space.sumi.save/mhtml/${escapeFilename(
        tab.url.replace(/^https?:\/\//, "")
      )}/${date}.mhtml`,
    });
  };
  reader.readAsDataURL(blob);
};

const saveImages = async (tab) => {
  const [{ result: srcs }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () =>
      [...document.querySelectorAll("img")].flatMap(
        (img) => [img.src] ?? img.srcset.split(",")
      ),
  });

  for (const src of [...new Set(srcs)])
    if (src.startsWith("http")) {
      const response = await fetch(src);
      const blob = await response.blob();
      console.log(blob);

      const extension = src.replace(/\?.+/, "").match(/(?<=\.)\w+$/)?.[0];
      console.log(extension, src);
      const contentType = extension
        ? {
            png: "image/png",
            gif: "image/gif",
            svg: "image/svg+xml",
            jpeg: "image/jpeg",
            jpg: "image/jpeg",
            webp: "image/webp",
            apng: "image/apng",
            bmp: "image/bmp",
            ico: "image/vnd.microsoft.icon",
            tiff: "image/tiff",
            tif: "image/tiff",
          }[extension]
        : blob.type;

      const reader = new FileReader();
      reader.onloadend = () => {
        const url = `data:${contentType};base64,${reader.result.split(",")[1]}`;
        chrome.downloads.download({
          url,
          filename: `space.sumi.save/image/${escapeFilename(
            src.replace(/^https?:\/\//, "")
          )}`,
          conflictAction: "overwrite",
        });
      };
      reader.readAsDataURL(blob);
    }
};

const save = async (tab) => {
  await loadImages(tab);
  saveMhtml(tab);
  saveImages(tab);
};

chrome.action.onClicked.addListener(save);
