export type AppMessageDownload = {
  type: "FPDL_DOWNLOAD";
  storyId: string;
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

export type ChromeMessageDownloadComplete = {
  type: "FPDL_DOWNLOAD_COMPLETE";
  storyId: string;
  url: string;
  filename: string;
};

export type ChromeMessage = ChromeMessageToggle | ChromeMessageDownloadComplete;

export type GraphqlEvent = {
  url: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestPayload: Record<string, string>;
  responseBody: Record<string, unknown>[];
  status: number;
};

export type MediaId = {
  __typename: "Video" | "Photo";
  id: string;
};

export type MediaPhotoUrl = {
  uri: string;
  height: number;
  width: number;
};

export type MediaPhoto = MediaId & {
  __typename: "Photo";
  url: string;
  created_time: number;
  image?: MediaPhotoUrl;
  viewer_image?: MediaPhotoUrl;
  photo_image?: MediaPhotoUrl;
};

export type MediaVideoUrl = {
  videoDeliveryResponseResult: {
    progressive_urls: Array<{
      progressive_url: string;
      metadata: { quality: "HD" | "SD" };
    }>;
  };
};

export type MediaVideo = MediaId & {
  __typename: "Video";
  url: string;
  created_time: number;
  videoDeliveryResponseFragment?: MediaVideoUrl;
  video_grid_renderer?: {
    video: {
      videoDeliveryResponseFragment: MediaVideoUrl;
    };
  };
};

export type MediaWatch = MediaId & {
  __typename: "Video";
  url: string;
};

export type Media = MediaPhoto | MediaVideo | MediaWatch;

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
        title: { text: string };
        owner: {
          __typename: "User";
          id: string;
        };
      };
    }
  ];
};

export type StoryWatch = {
  attachments: [
    {
      media: {
        __typename: "Video";
        id: string;
        title: { text: string };
        owner: User;
        creation_story: {
          id: string;
          comet_sections: {
            id: string;
            message: {
              story: {
                message: { text: string };
              };
            };
          };
        };
      };
    }
  ];
};

export type Story = StoryPost | StoryVideo | StoryWatch;
