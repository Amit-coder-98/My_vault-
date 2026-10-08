import { api, API_ORIGIN } from "./api";
// XMLHttpRequest supplies actual uploaded-byte progress; API still owns credentials.
export async function uploadFile<T>(
  path: string,
  body: FormData,
  progress: (value: number) => void,
): Promise<T> {
  const session = await api<{ token: string }>("/auth/upload-token", {
    method: "POST",
  });
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", API_ORIGIN + "/api/v1" + path);
    request.withCredentials = true;
    request.setRequestHeader("Authorization", `Bearer ${session.token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new Error(
          "The upload was interrupted. Check your connection and try again.",
        ),
      );
    request.onload = () => {
      if (request.status === 413) {
        reject(
          new Error("This upload exceeds the file size limit. Choose a smaller audio file or cover image."),
        );
        return;
      }
      let result: T & { detail?: string };
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The upload could not be completed."));
        return;
      }
      if (request.status >= 200 && request.status < 300) resolve(result);
      else
        reject(
          new Error(result.detail ?? "The upload could not be completed."),
        );
    };
    request.send(body);
  });
}
