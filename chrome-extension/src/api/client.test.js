import { localDemoResponse } from "./client";

describe("local embedded playground API", () => {
  const server = "https://notes.example.com";
  const annotation = {
    uid: "local-demo-test",
    url: "https://article.example.com/",
    host: "article.example.com",
    title: "Demo article",
    data: { text: "A useful thought", notes: "Keep this" },
  };

  afterEach(() => {
    localDemoResponse(`${server}/annotations/delete`, {
      uid: annotation.uid,
    });
  });

  it("keeps playground highlights in local memory", () => {
    expect(localDemoResponse(`${server}/annotations/save`, annotation)).toEqual(
      { data: {}, statusCode: 200 },
    );

    expect(
      localDemoResponse(`${server}/annotations/queryByUrl`, {
        url: annotation.url,
      }).data.list,
    ).toEqual([{ ...annotation, id: annotation.uid }]);
  });

  it("deletes local playground highlights without a server request", () => {
    localDemoResponse(`${server}/annotations/save`, annotation);
    localDemoResponse(`${server}/annotations/delete`, {
      uid: annotation.uid,
    });

    expect(
      localDemoResponse(`${server}/annotations/queryByUrl`, {
        url: annotation.url,
      }).data.list,
    ).toEqual([]);
  });

  it("rejects unsupported playground API routes", () => {
    expect(() => localDemoResponse(`${server}/users/login`, {})).toThrow(
      /unsupported local playground request/,
    );
  });
});
