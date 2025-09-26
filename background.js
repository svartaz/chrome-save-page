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
  console.log("mhtml", date, tab.url);

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  chrome.downloads.download({
    url,
    filename: `space.sumi.save/mhtml/${escapeFilename(
      tab.url.replace(/^https?:\/\//, "")
    )}/${date}.mhtml`,
  });
};

const saveImages = async (tab) => {
  const [{ result: srcs }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () =>
      [...document.querySelectorAll("img")].flatMap(
        (img) => [img.src] ?? img.srcset.split(",")
      ),
  });

  for (const src of [...new Set(srcs)]) {
    // avoid rate limit
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (src.startsWith("http")) {
      const response = await fetch(src, {
        referrer: tab.url,
        "User-Agent": navigator.userAgent,
        credentials: "include",
      });
      const blob = await response.blob();

      const extension = src.replace(/\?.+/, "").match(/(?<=\.)\w+$/)?.[0];
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
        : undefined;

      console.log("image", contentType, blob.type, src);
      if (contentType && !blob.type.startsWith(contentType)) {
        const result = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });

        chrome.downloads.download({
          url: `data:${contentType ?? blob.type};base64,${
            result.split(",")[1]
          }`,
          filename: `space.sumi.save/image/${escapeFilename(
            src.replace(/^https?:\/\//, "")
          )}`,
          conflictAction: "overwrite",
        });
      }
    }
  }
};

const save = async (tab) => {
  await loadImages(tab);
  saveMhtml(tab);
  saveImages(tab);
};

chrome.action.onClicked.addListener(save);
