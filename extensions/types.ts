export type AppMessageDownload = {
  type: "FPDL_DOWNLOAD";
  url: string;
  filename: string;
};

export type AppMessageStoryCount = {
  type: "FPDL_STORY_COUNT";
  count: number;
};

export type AppMessage = AppMessageDownload | AppMessageStoryCount;

export type ChromeMessageToggle = {
  type: "FPDL_TOGGLE";
};

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
  created_time: number;
  image: {
    uri: string;
  };
};

export type StoryVideo = {
  __typename: "Video";
  id: string;
  url: string;
  created_time: number;
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

export type StoryGroup = {
  __typename: "Group";
  id: string;
  name: string;
};

export type StoryActor = {
  __typename: "User";
  id: string;
  name: string;
};

export type Story = {
  id: string;
  post_id: string;
  wwwURL: string;
  message: null | { text: string };
  actors: [StoryActor];
  attachments:
    | []
    | [
        {
          styles: {
            attachment:
              | {} // Un-supported attachment
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
        }
      ];
  attached_story: null | Story;
};
