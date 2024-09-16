import React from "react";
import "./AnnotationsExplorer.less";
import { deleteAnnotation, findAnnotations } from "../../api/annotations";

export default class Sidebar extends React.Component {
  state = {
    annotations: [],
  };

  async componentDidMount() {
    await this.fetchAnnotations();
  }

  async fetchAnnotations() {
    const result = await findAnnotations({
      selectors: {
        host: window.location.host,
        title: document.title,
      },
    });

    this.setState({
      annotations: result.data.list || [],
    });
  }

  render() {
    return (
      <div style={{ flexGrow: "1", overflowY: "auto" }}>
        <div className={"annotations-explorer-root"}>
          <div className="columns">
            <div className="column" style={{ flex: "1 1 auto" }}>
              {this.state.annotations.map((item) => {
                return (
                  <div className="list-item">
                    <div className="content">
                      <ThirdLevelItem
                        data={item}
                        onDeleteAnnotation={() => {
                          if (
                            !confirm(
                              "Are you sure you want to delete this annotation?"
                            )
                          ) {
                            return;
                          }
                          deleteAnnotation(item).then(() => {
                            this.setState({
                              annotations: this.state.annotations.filter(
                                (x) => x.id !== item.id
                              ),
                            });
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class ThirdLevelItem extends React.Component {
  render() {
    return (
      <div className="third-level-item">
        <div
          className="hit"
          onClick={() => {
            const annotationElement = document.getElementsByTagName("web-marker-highlight");
            // alert(this.props.data.uid);
            for (let i = 0; i < annotationElement.length; i++) {
              if (annotationElement[i].getAttribute("highlight-id") === this.props.data.uid) {
                annotationElement[i].scrollIntoView({ behavior: "smooth" }); // Smooth scroll to the annotated text
              }
            }
          }}
        >
          {this.props.data.data.textBefore}
          <span
            className="text"
            style={{ textDecorationColor: this.props.data.data.color }}
          >
            {this.props.data.data.text}
          </span>
          {this.props.data.data.textAfter}

          {!!this.props.data.data.notes && (
            <div className="notes-wrapper">
              <div>{this.props.data.data.notes}</div>
            </div>
          )}
          <div className="url">
            <span
              className="color-dot"
              style={{ background: this.props.data.data.color }}
            />
            {this.props.data.url}
            <a
              style={{ float: "right" }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                this.props.onDeleteAnnotation();
              }}
            >
              Delete
            </a>
          </div>
        </div>
      </div>
    );
  }
}
