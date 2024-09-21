import React from "react";
import "./AnnotationsExplorer.less";
import { deleteAnnotation, findAnnotations } from "../../api/annotations";
import AnnotationItem from "./AnnotationItem";
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
      annotations: result.list || [],
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
                      <AnnotationItem
                        onClickAction="scroll"
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
