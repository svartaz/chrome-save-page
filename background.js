const ROOT = "space.sumi.save";

// Characters Chrome rejects in download filenames, plus "&", ";" and "%" so the
// escaping stays unambiguous.
const FILENAME_ESCAPES = {
  "&": "&amp;",
  ";": "&semi;",
  "\\": "&bsol;",
  "?": "&quest;",
  "%": "&percnt;",
  "*": "&ast;",
  ":": "&colon;",
  "|": "&vert;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
  "`": "&grave;",
};

const MIME_BY_EXTENSION = {
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
};

// "https://a.com/b/c?d" -> "a.com/b/c&quest;d". "/" stays a directory
// separator; empty segments (e.g. from a trailing slash) are dropped because
// Chrome rejects them.
const urlToPath = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[&;\\?%*:|"<>`]/g, (c) => FILENAME_ESCAPES[c])
    .split("/")
    .filter(Boolean)
    .join("/");

const timestamp = () => new Date().toISOString().replace(/-|T|:|\..+/g, "");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Service workers have no URL.createObjectURL, so downloads go through data URLs.
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Scroll through the page so lazy-loaded images are fetched before capture.
const loadImages = (tab) =>
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const { scrollX, scrollY, innerHeight: step } = window;
      if (!step) return;
      // Measured once on purpose: re-reading it would never end on infinite-scroll pages.
      const height = document.documentElement.scrollHeight;
      for (let y = 0; y < height; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      window.scrollTo(scrollX, scrollY);
    },
  });

const saveMhtml = async (tab) => {
  const filename = `${ROOT}/mhtml/${urlToPath(tab.url)}/${timestamp()}.mhtml`;
  console.log("mhtml", filename);

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  await chrome.downloads.download({ url: await blobToDataUrl(blob), filename });
};

const collectImageUrls = async (tab) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    // currentSrc is the candidate the browser actually picked from srcset/<picture>.
    func: () => [...document.images].map((img) => img.currentSrc || img.src),
  });
  return [...new Set(result)].filter((src) => /^https?:/.test(src));
};

const saveImage = async (src) => {
  const response = await fetch(src, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  let blob = await response.blob();

  // Prefer the type implied by the URL's extension so content matches the filename.
  const extension = new URL(src).pathname.match(/\.(\w+)$/)?.[1].toLowerCase();
  const type = MIME_BY_EXTENSION[extension];
  console.log("image", type, blob.type, src);
  if (type && type !== blob.type) blob = new Blob([blob], { type });

  await chrome.downloads.download({
    url: await blobToDataUrl(blob),
    filename: `${ROOT}/image/${urlToPath(src)}`,
    conflictAction: "overwrite",
  });
};

const saveImages = async (tab) => {
  for (const src of await collectImageUrls(tab)) {
    await sleep(200); // avoid rate limit
    try {
      await saveImage(src);
    } catch (error) {
      console.error("image failed", src, error);
    }
  }
};

const save = async (tab) => {
  console.log("save", tab.url);
  await loadImages(tab);
  const results = await Promise.allSettled([saveMhtml(tab), saveImages(tab)]);
  for (const { status, reason } of results) {
    if (status === "rejected") console.error(reason);
  }
};

chrome.action.onClicked.addListener((tab) =>
  save(tab).catch((error) => console.error("save failed", tab.url, error))
);
