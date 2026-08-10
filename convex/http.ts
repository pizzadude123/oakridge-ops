import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { crisisAttachmentUpload, crisisAttachmentUploadOptions } from "./crisisAttachmentsHttp";
import { emailAssetUpload, emailAssetUploadOptions } from "./emailAssetsHttp";
import { googleCallback } from "./googleHttp";
import { graphCallback } from "./graphHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/crisis-attachments/upload", method: "OPTIONS", handler: crisisAttachmentUploadOptions });
http.route({ path: "/crisis-attachments/upload", method: "POST", handler: crisisAttachmentUpload });
http.route({ path: "/email-assets/upload", method: "OPTIONS", handler: emailAssetUploadOptions });
http.route({ path: "/email-assets/upload", method: "POST", handler: emailAssetUpload });
http.route({ path: "/graph/callback", method: "GET", handler: graphCallback });
http.route({ path: "/google/callback", method: "GET", handler: googleCallback });

export default http;
