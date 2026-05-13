import { describe, it, expect, vi } from "vitest";
import { isAcceptedFile, processUploadedFiles, DRAG_DROP_MAX_FILES } from "../folderUpload";

// Mock JSZip
vi.mock("jszip", () => {
  return {
    default: {
      loadAsync: vi.fn(),
    },
  };
});

describe("isAcceptedFile", () => {
  it("accepts PDF files", () => {
    expect(isAcceptedFile(new File([""], "report.pdf"))).toBe(true);
  });

  it("accepts DOCX files", () => {
    expect(isAcceptedFile(new File([""], "contract.docx"))).toBe(true);
  });

  it("accepts image files", () => {
    expect(isAcceptedFile(new File([""], "scan.jpg"))).toBe(true);
    expect(isAcceptedFile(new File([""], "photo.png"))).toBe(true);
    expect(isAcceptedFile(new File([""], "image.tiff"))).toBe(true);
    expect(isAcceptedFile(new File([""], "pic.webp"))).toBe(true);
    expect(isAcceptedFile(new File([""], "apple.heic"))).toBe(true);
  });

  it("accepts spreadsheet files", () => {
    expect(isAcceptedFile(new File([""], "data.csv"))).toBe(true);
    expect(isAcceptedFile(new File([""], "sheet.xlsx"))).toBe(true);
    expect(isAcceptedFile(new File([""], "old.xls"))).toBe(true);
  });

  it("accepts text-based files", () => {
    expect(isAcceptedFile(new File([""], "notes.txt"))).toBe(true);
    expect(isAcceptedFile(new File([""], "readme.md"))).toBe(true);
    expect(isAcceptedFile(new File([""], "rich.rtf"))).toBe(true);
  });

  it("accepts email files", () => {
    expect(isAcceptedFile(new File([""], "message.eml"))).toBe(true);
    expect(isAcceptedFile(new File([""], "outlook.msg"))).toBe(true);
  });

  it("accepts CAD files", () => {
    expect(isAcceptedFile(new File([""], "plan.dwg"))).toBe(true);
    expect(isAcceptedFile(new File([""], "drawing.dxf"))).toBe(true);
  });

  it("accepts ZIP files", () => {
    expect(isAcceptedFile(new File([""], "archive.zip"))).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isAcceptedFile(new File([""], "video.mp4"))).toBe(false);
    expect(isAcceptedFile(new File([""], "script.js"))).toBe(false);
    expect(isAcceptedFile(new File([""], "style.css"))).toBe(false);
    expect(isAcceptedFile(new File([""], "noextension"))).toBe(false);
    expect(isAcceptedFile(new File([""], "archive.rar"))).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAcceptedFile(new File([""], "REPORT.PDF"))).toBe(true);
    expect(isAcceptedFile(new File([""], "Image.JPG"))).toBe(true);
    expect(isAcceptedFile(new File([""], "Doc.DOCX"))).toBe(true);
  });

  it("accepts known MIME types even without extension", () => {
    expect(isAcceptedFile(new File(["pdf"], "untitled", { type: "application/pdf" }))).toBe(true);
    expect(isAcceptedFile(new File(["img"], "scan", { type: "image/png" }))).toBe(true);
  });

  it("handles filenames with spaces and dots", () => {
    expect(isAcceptedFile(new File([""], "my report.pdf"))).toBe(true);
    expect(isAcceptedFile(new File([""], "DP- 16.02.zip"))).toBe(true);
    expect(isAcceptedFile(new File([""], "file.v2.docx"))).toBe(true);
  });
});

describe("processUploadedFiles", () => {
  it("returns accepted non-ZIP files directly", async () => {
    const files = [
      new File(["a"], "doc.pdf"),
      new File(["b"], "photo.jpg"),
    ];
    const result = await processUploadedFiles(files);
    expect(result.files).toHaveLength(2);
    expect(result.zipErrors).toHaveLength(0);
    expect(result.files[0].name).toBe("doc.pdf");
    expect(result.files[1].name).toBe("photo.jpg");
  });

  it("filters out unsupported files", async () => {
    const files = [
      new File(["a"], "doc.pdf"),
      new File(["b"], "video.mp4"),
      new File(["c"], "script.js"),
    ];
    const result = await processUploadedFiles(files);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("doc.pdf");
    expect(result.zipErrors).toHaveLength(0);
  });

  it("returns empty arrays when no files match", async () => {
    const files = [
      new File(["a"], "video.mp4"),
      new File(["b"], "app.exe"),
    ];
    const result = await processUploadedFiles(files);
    expect(result.files).toHaveLength(0);
    expect(result.zipErrors).toHaveLength(0);
  });

  it("extracts files from a valid ZIP", async () => {
    const JSZip = (await import("jszip")).default;
    const mockEntry = {
      dir: false,
      name: "inner.pdf",
      date: new Date(),
      async: vi.fn().mockResolvedValue(new Blob(["pdf content"])),
    };
    (JSZip.loadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: { "inner.pdf": mockEntry },
    });

    const zipFile = new File(["fake zip"], "bundle.zip");
    const result = await processUploadedFiles([zipFile]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("inner.pdf");
    expect(result.zipErrors).toHaveLength(0);
  });

  it("returns ZIP error when archive cannot be read", async () => {
    const JSZip = (await import("jszip")).default;
    (JSZip.loadAsync as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Invalid ZIP")
    );

    const zipFile = new File(["bad data"], "corrupt.zip");
    const result = await processUploadedFiles([zipFile]);
    expect(result.files).toHaveLength(0);
    expect(result.zipErrors).toHaveLength(1);
    expect(result.zipErrors[0]).toContain("Could not read ZIP archive");
    expect(result.zipErrors[0]).toContain("Invalid ZIP");
  });

  it("returns ZIP error when no files have supported extensions", async () => {
    const JSZip = (await import("jszip")).default;
    const mockEntry = {
      dir: false,
      name: "video.mp4",
      date: new Date(),
      async: vi.fn().mockResolvedValue(new Blob(["video"])),
    };
    (JSZip.loadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: { "video.mp4": mockEntry },
    });

    const zipFile = new File(["fake zip"], "media.zip");
    const result = await processUploadedFiles([zipFile]);
    expect(result.files).toHaveLength(0);
    expect(result.zipErrors).toHaveLength(1);
    expect(result.zipErrors[0]).toContain("none have supported extensions");
  });

  it("mixes ZIP extraction with regular files", async () => {
    const JSZip = (await import("jszip")).default;
    const mockEntry = {
      dir: false,
      name: "from-zip.docx",
      date: new Date(),
      async: vi.fn().mockResolvedValue(new Blob(["docx"])),
    };
    (JSZip.loadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: { "from-zip.docx": mockEntry },
    });

    const files = [
      new File(["a"], "standalone.pdf"),
      new File(["zip"], "bundle.zip"),
    ];
    const result = await processUploadedFiles(files);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.name)).toContain("standalone.pdf");
    expect(result.files.map((f) => f.name)).toContain("from-zip.docx");
    expect(result.zipErrors).toHaveLength(0);
  });
});

describe("DRAG_DROP_MAX_FILES constant", () => {
  it("is exported and equals 50", () => {
    expect(DRAG_DROP_MAX_FILES).toBe(50);
  });
});

describe("ExtractionResult structure", () => {
  it("processUploadedFiles returns ExtractionResult without limit fields for normal files", async () => {
    const files = [new File(["a"], "doc.pdf")];
    const result = await processUploadedFiles(files);
    expect(result).toHaveProperty("files");
    expect(result).toHaveProperty("zipErrors");
    expect(result.limitExceeded).toBeUndefined();
    expect(result.guidanceMessage).toBeUndefined();
  });
});
