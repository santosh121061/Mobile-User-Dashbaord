import Constants from "expo-constants";
import { z } from "zod";

const extras = z
    .object({
        environment: z
            .enum(["development", "preview", "production"])
            .default("development"),
        apiUrl: z.string().default(""),
    })
    .parse(Constants.expoConfig?.extra ?? {});
export const environment = extras.environment;
export const apiUrl = extras.apiUrl.replace(/\/$/, "");
export const configured =
    !!apiUrl &&
    (environment === "development"
        ? /^https?:\/\//.test(apiUrl)
        : apiUrl.startsWith("https://"));
export const storageNamespace =
    "dashboard." + environment + "." + apiUrl.replace(/[^a-zA-Z0-9._-]/g, "_");
