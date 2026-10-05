import axios, { AxiosProgressEvent, AxiosRequestConfig } from "axios";
import type { User } from "oidc-client";
import { authManager } from "../auth/oidc";
import { useAuthStore } from "../auth/authStore";
import { removeFireantToken } from "../utils/token";
import { APP_URL, FIREANT_BASE_URL, STATIC_FIREANT_URL } from "./config";

const DEFAULT_ACCESS_TOKEN = import.meta.env.VITE_FIREANT_ACCESS_TOKEN || "";

const STATIC_URL = STATIC_FIREANT_URL;
const FIREANT_API_URL = FIREANT_BASE_URL;

const baseConfig: AxiosRequestConfig = {
  timeout: 30000,
};

export interface Response<T> {
  data: T | null | undefined;
  status: number;
  isError: boolean;
  errorMessage: string;
}

let signedOut = false;

export const getAccessToken = (): string => {
  const { user } = useAuthStore.getState();

  if (user) {
    if (user.expires_at && user.expires_at > Date.now() / 1000) {
      return user.access_token;
    }

    if (!signedOut) {
      signedOut = true;
        // Perform a local sign-out when the access token is expired.
        // Avoid redirecting to the identity provider (FireAnt) so the
        // app stays on its own login UI.
        authManager
          .removeUser()
          .catch((err) => {
            console.error("Auto remove user after token expiry failed:", err);
          })
          .finally(() => {
            useAuthStore.getState().reset();
            removeFireantToken();
          });
    }
  }

  return DEFAULT_ACCESS_TOKEN;
};

export const getAuthenticatedUser = (): User | null => {
  return useAuthStore.getState().user;
};

const buildJsonConfig = (accessToken: string): AxiosRequestConfig => ({
  ...baseConfig,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
});

const buildFormConfig = (
  accessToken: string,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
): AxiosRequestConfig => ({
  ...baseConfig,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "multipart/form-data",
  },
  onUploadProgress,
});

const buildUrlEncodedConfig = (accessToken: string): AxiosRequestConfig => ({
  ...baseConfig,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

const toUrlEncodedParams = <D>(data: D): URLSearchParams => {
  const params = new URLSearchParams();
  Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params;
};

export async function apiGet<R>(
  url: string,
  converter?: (data: any) => R,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.get(url, buildJsonConfig(accessToken));

    if (response.status === 200) {
      return {
        data: converter ? converter(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }

    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex: any) {
    const errorMsg =
      ex?.response?.data?.detail ||
      ex?.response?.data?.message ||
      ex?.message ||
      "Lỗi khi thực hiện yêu cầu.";
    console.error("API GET Error:", ex);

    if (ex?.response?.status === 429) {
      const detail = ex?.response?.data?.detail;
      if (detail?.error === "TOKEN_QUOTA_EXCEEDED") {
        return {
          data: null,
          status: 429,
          isError: true,
          errorMessage:
            detail.message ||
            "Bạn đã hết token. Vui lòng chờ làm mới hoặc nâng cấp gói.",
        };
      }
    }

    return {
      data: null,
      status: ex?.response?.status || -1,
      isError: true,
      errorMessage: errorMsg,
    };
  }
}

export async function apiPut<R, D>(
  url: string,
  data: D,
  converterR?: (data: any) => R,
  converterD?: (data: D) => any,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.put(
      url,
      converterD ? converterD(data) : data,
      buildJsonConfig(accessToken),
    );

    if (response.status === 200) {
      return {
        data: converterR ? converterR(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiPost<R, D>(
  url: string,
  data: D,
  converterR?: (data: any) => R,
  converterD?: (data: D) => any,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.post(
      url,
      converterD ? converterD(data) : data,
      buildJsonConfig(accessToken),
    );
    if (response.status === 200 || response.status === 201) {
      return {
        data: converterR ? converterR(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex: any) {
    const errorMsg =
      ex?.response?.data?.detail ||
      ex?.response?.data?.message ||
      ex?.message ||
      "Lỗi khi thực hiện yêu cầu.";
    console.error("API POST Error:", ex);

    if (ex?.response?.status === 429) {
      const detail = ex?.response?.data?.detail;
      if (detail?.error === "TOKEN_QUOTA_EXCEEDED") {
        return {
          data: null,
          status: 429,
          isError: true,
          errorMessage:
            detail.message ||
            "Bạn đã hết token. Vui lòng chờ làm mới hoặc nâng cấp gói.",
        };
      }
    }

    return {
      data: null,
      status: ex?.response?.status || -1,
      isError: true,
      errorMessage: errorMsg,
    };
  }
}

export async function apiPostForm<R>(
  url: string,
  data: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.post(
      url,
      data,
      buildFormConfig(accessToken, onUploadProgress),
    );
    if (response.status === 200) {
      return {
        data: response.data as R,
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiPostUrlEncoded<R, D>(
  url: string,
  data: D,
  converter?: (data: any) => R,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  const params = toUrlEncodedParams(data);

  try {
    const response = await axios.post(
      url,
      params,
      buildUrlEncodedConfig(accessToken),
    );
    if (response.status === 200 || response.status === 201) {
      return {
        data: converter ? converter(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex: any) {
    const errorMsg =
      ex?.response?.data?.detail ||
      ex?.response?.data?.message ||
      ex?.message ||
      "Lỗi khi thực hiện yêu cầu.";
    console.error("API POST URL-Encoded Error:", ex);
    return {
      data: null,
      status: ex?.response?.status || -1,
      isError: true,
      errorMessage:
        typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
    };
  }
}

export async function apiPatch<R, D>(
  url: string,
  data: D,
  converterR?: (data: any) => R,
  converterD?: (data: D) => any,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.patch(
      url,
      converterD ? converterD(data) : data,
      buildJsonConfig(accessToken),
    );
    if (response.status === 200) {
      return {
        data: converterR ? converterR(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }

    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiPutForm<R>(
  url: string,
  data: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.put(
      url,
      data,
      buildFormConfig(accessToken, onUploadProgress),
    );
    if (response.status === 200) {
      return {
        data: response.data as R,
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiPatchForm<R>(
  url: string,
  data: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.patch(
      url,
      data,
      buildFormConfig(accessToken, onUploadProgress),
    );
    if (response.status === 200) {
      return {
        data: response.data as R,
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiDelete<R>(
  url: string,
  converter?: (data: any) => R,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  try {
    const response = await axios.delete<R>(url, buildJsonConfig(accessToken));

    if (response.status === 200) {
      return {
        data: converter ? converter(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }

    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex) {
    return {
      data: null,
      status: -1,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  }
}

export async function apiPutUrlEncoded<R, D>(
  url: string,
  data: D,
  converter?: (data: any) => R,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  const params = toUrlEncodedParams(data);

  try {
    const response = await axios.put(
      url,
      params,
      buildUrlEncodedConfig(accessToken),
    );
    if (response.status === 200) {
      return {
        data: converter ? converter(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex: any) {
    const errorMsg =
      ex?.response?.data?.detail ||
      ex?.response?.data?.message ||
      ex?.message ||
      "Lỗi khi thực hiện yêu cầu.";
    console.error("API PUT URL-Encoded Error:", ex);
    return {
      data: null,
      status: ex?.response?.status || -1,
      isError: true,
      errorMessage:
        typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
    };
  }
}

export async function apiPatchUrlEncoded<R, D>(
  url: string,
  data: D,
  converter?: (data: any) => R,
): Promise<Response<R>> {
  const accessToken = getAccessToken();
  const params = toUrlEncodedParams(data);

  try {
    const response = await axios.patch(
      url,
      params,
      buildUrlEncodedConfig(accessToken),
    );
    if (response.status === 200) {
      return {
        data: converter ? converter(response.data) : (response.data as R),
        status: response.status,
        isError: false,
        errorMessage: "",
      };
    }
    return {
      data: null,
      status: response.status,
      isError: true,
      errorMessage: "Lỗi khi thực hiện yêu cầu.",
    };
  } catch (ex: any) {
    const errorMsg =
      ex?.response?.data?.detail ||
      ex?.response?.data?.message ||
      ex?.message ||
      "Lỗi khi thực hiện yêu cầu.";
    console.error("API PATCH URL-Encoded Error:", ex);
    return {
      data: null,
      status: ex?.response?.status || -1,
      isError: true,
      errorMessage:
        typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
    };
  }
}

export {
  STATIC_URL,
  FIREANT_API_URL,
  APP_URL,
};
