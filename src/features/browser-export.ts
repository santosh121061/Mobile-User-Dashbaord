import type { PrivateWork } from "@/auth/private-work";

export function downloadBrowserExport(buffer: ArrayBuffer, scope: PrivateWork) {
  scope.assertCurrent();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = "export.xlsx";
    link.style.display = "none";
    document.body.appendChild(link);
    scope.assertCurrent();
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
