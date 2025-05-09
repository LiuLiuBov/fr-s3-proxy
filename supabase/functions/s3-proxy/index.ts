import { AwsClient } from "npm:aws4fetch";
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

const IGNORE_HEADERS = [
  "authorization",
  "host",
  "x-secret-key",
  "x-real-ip",
  "cf-connecting-ip",
  "cf-ew-preview-server",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-path",
  "x-forwarded-port",
  "x-forwarded-prefix",
  "x-forwarded-proto",
  "transfer-encoding" 
];

function getCleanHeaders(req: Request): Headers {
  const filtered = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!IGNORE_HEADERS.includes(key.toLowerCase())) {
      filtered.append(key, value);
    }
  }
  return filtered;
}

serve(async (request: Request) => {
  const requiredSecret = Deno.env.get("HARDCODED_SECRET");
  if (request.headers.get("x-secret-key") !== requiredSecret) {
    return new Response("Forbidden", { status: 403 });
  }

  const endpoint = Deno.env.get("FR_S3_ENDPOINT")!;
  const bucket = Deno.env.get("FR_S3_BUCKET")!;
  const region = Deno.env.get("FR_S3_REGION")!;
  const accessKey = Deno.env.get("FR_S3_KEY")!;
  const secretKey = Deno.env.get("FR_S3_SECRET")!;

  const urlOrig = new URL(request.url);
  const strippedPath = urlOrig.pathname.replace(/^\/s3-proxy/, "");
  const s3Url = new URL(`https://${endpoint}${strippedPath}${urlOrig.search}`);

  console.log("=== Incoming request ===");
  console.log("Method:", request.method);
  console.log("URL:", request.url);
  console.log("S3 target:", s3Url.toString());

  const newHeaders = getCleanHeaders(request);

  const s3 = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region,
    service: "s3",
  });

  const signed = await s3.sign(s3Url, {
    method: request.method,
    headers: newHeaders,
    body: request.body,
  });

  signed.headers.set("host", s3Url.host);

  console.log("=== Signed request ===");
  console.log("Signed URL:", signed.url);
  console.log("Signed headers:", [...signed.headers.entries()]);

  const response = await fetch(signed);

  if (!response.ok) {
    console.log("=== Response from S3 ===");
    console.log("Status:", response.status);
    console.log("Headers:", [...response.headers.entries()]);
    const text = await response.text();
    console.log("Body:\n", text);
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  }

  return response;
});
