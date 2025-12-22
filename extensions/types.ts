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

export type MediaPhoto = {
  __typename: "Photo";
  id: string;
  url: string;
  created_time: number;
  image: {
    uri: string;
  };
};

export type MediaVideo = {
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

export type Media = MediaPhoto | MediaVideo;

export type Group = {
  __typename: "Group";
  id: string;
  name: string;
};

export type User = {
  __typename: "User";
  id: string;
  name: string;
};

export type StoryPost = {
  id: string;
  post_id: string;
  wwwURL: string;
  message: null | { text: string };
  actors: [User];
  attachments:
    | []
    | [
        {
          styles: {
            attachment:
              | {} // Un-supported attachment
              | {
                  media: Media;
                }
              | {
                  all_subattachments: {
                    count: number;
                    nodes: Array<{ media: Media }>;
                  };
                };
          };
        }
      ];
  attached_story: null | StoryPost;
};

export type StoryVideo = {
  id: string;
  post_id: string;
  message: null | { text: string };
  actors: [User];
  attachments: [
    {
      url: string;
      media: MediaVideo & {
        name: string;
        publish_time: number;
        owner: {
          __typename: "User";
          id: string;
        };
      };
    }
  ];
};

export type Story = StoryPost | StoryVideo;
