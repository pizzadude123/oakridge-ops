import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { EmailImageAlignment, EmailImagePlacement, EmailImageWidth, EmailLayoutImage, InlineEmailImage } from "../../src/domain/email";
import {
  emailAssetCampaignMaterial,
  inlineImageIdentity,
  validateEmailAssetBatch,
  validateEmailImageBytes,
} from "./emailAssets";

export type EmailAssetRequest = {
  assetId: Id<"emailAssets">;
  alt: string;
  placement?: EmailImagePlacement;
  width?: EmailImageWidth;
  alignment?: EmailImageAlignment;
};

function cleanAlt(value: string, index: number) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
    || `Oakridge MUN campaign image ${index + 1}`;
}

export async function prepareEmailAssets(
  ctx: ActionCtx,
  ownerId: Id<"users">,
  requests: EmailAssetRequest[],
): Promise<{
  inlineImages: InlineEmailImage[];
  layoutImages: EmailLayoutImage[];
  campaignMaterial: string;
}> {
  const assetIds = requests.map(({ assetId }) => assetId);
  if (new Set(assetIds).size !== assetIds.length) throw new Error("Choose each email image only once.");
  const assets = requests.length
    ? await ctx.runQuery(internal.emailAssets.forSend, { ownerId, assetIds })
    : [];
  validateEmailAssetBatch(assets.map(({ size }) => size));
  const inlineImages = await Promise.all(assets.map(async (asset, index): Promise<InlineEmailImage> => {
    const blob = await ctx.storage.get(asset.storageId);
    if (!blob) throw new Error("One or more email images are unavailable. No emails were sent.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    validateEmailImageBytes(bytes, asset.contentType);
    const identity = inlineImageIdentity(index, asset.contentType);
    return {
      ...identity,
      contentType: asset.contentType,
      contentBase64: Buffer.from(bytes).toString("base64"),
    };
  }));
  const altText = requests.map(({ alt }, index) => cleanAlt(alt, index));
  const layout = requests.map((request) => ({
    placement: request.placement ?? "body",
    width: request.width ?? "wide",
    alignment: request.alignment ?? "center",
  }));
  return {
    inlineImages,
    layoutImages: inlineImages.map(({ contentId }, index) => ({ src: `cid:${contentId}`, alt: altText[index], ...layout[index] })),
    campaignMaterial: emailAssetCampaignMaterial(assets.map((asset, index) => ({ sha256: asset.sha256, alt: altText[index], ...layout[index] }))),
  };
}
