export type FpdlDownloadMessage = {
  type: "FPDL_DOWNLOAD";
  url: string;
  filename: string;
};

export type FpdlDownloadResponse =
  | { ok: true; downloadId: number }
  | { ok: false; error: string };

export type GraphqlEvent = {
  url: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestPayload: Record<string, string>;
  responseBody: Record<string, unknown>[];
  status: number;
};

export type StoryPhoto = {
  __typename: "Photo";
  id: string;
  url: string;
  image: {
    uri: string;
  };
};

export type StoryVideo = {
  __typename: "Video";
  id: string;
  url: string;
  videoDeliveryResponseFragment: {
    videoDeliveryResponseResult: {
      progressive_urls: Array<{
        progressive_url: string;
        metadata: { quality: "HD" | "SD" };
      }>;
    };
  };
};

export type StoryMedia = StoryPhoto | StoryVideo;

export type Story = {
  id: string;
  post_id: string;
  wwwURL: string;
  message: { text: string };
  attachments:
    | []
    | [
        {
          styles: {
            attachment:
              | {
                  media: StoryMedia;
                }
              | {
                  all_subattachments: {
                    count: number;
                    nodes: Array<{ media: StoryMedia }>;
                  };
                };
          };
        },
      ];
};
