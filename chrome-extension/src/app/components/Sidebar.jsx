import React from "react";
import "./AnnotationsExplorer.less";
import { deleteAnnotation, findAnnotations } from "../../api/annotations";
import SidebarItem from "./SidebarItem";
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
      <div className="sidebar-root" style={{ flexGrow: "1", overflowY: "auto" }}>
          <h6>
            {window.location.host}
          </h6>
          <h2>
            {document.title}
          </h2>
          <div className="list-item">
          {this.state.annotations.map((item) => {
            return (
                <div className="content">
                  <SidebarItem
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
                      deleteAnnotation({ uid: item.uid }).then(() => {
                        this.setState({
                          annotations: this.state.annotations.filter(
                            (x) => x.id !== item.id
                          ),
                        });
                      });
                    }}
                  />
                </div>
              );
            })}
        </div>
      </div>
    );
  }
}
