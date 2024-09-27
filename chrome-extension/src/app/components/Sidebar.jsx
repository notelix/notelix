import React, { useEffect } from "react";
import "../../sidebar.less";
import { deleteAnnotation, findAnnotations } from "../../api/annotations";
import SidebarItem from "./SidebarItem";

export default class Sidebar extends React.Component {
  state = {
    annotations: [],
    sidebarWidth: 300, // Default width
  };

  async componentDidMount() {
    await this.fetchAnnotations();
    this.initDrag();
  }

  componentDidMount() {
    this.fetchAnnotations();
    this.initDrag();
  };

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

  initDrag() {
    const dragger = document.getElementById("sidebar-dragger");

    // Check if the mousedown event listener is already attached
    if (!dragger.hasAttribute('mousedown-listener')) {
      dragger.addEventListener("mousedown", (e) => {
        e.preventDefault();
        document.addEventListener("mousemove", this.onDrag);
        document.addEventListener("mouseup", this.stopDrag);
      });
      dragger.setAttribute('mousedown-listener', 'true'); // Mark as having the listener
    }
  }

  onDrag = (e) => {
    requestAnimationFrame(() => {
      const newWidth = e.clientX; // Get the new width based on mouse position
      const sidebar = document.getElementById("notelix-sidebar-container");
      if (newWidth > 300 && newWidth < 700) {
        sidebar.style.width = newWidth + "px";
      }
    });
  };

  stopDrag = () => {
    document.removeEventListener("mousemove", this.onDrag);
    document.removeEventListener("mouseup", this.stopDrag);
  };

  render() {
    return (
      <div id="sidebar-root" style={{ flexGrow: "1", overflowY: "auto" }}>
        {/* <h6>{window.location.host}</h6> */}
        <h5 className="text-sm font-semibold mb-1">{document.title}</h5>
        <div className="list-item">
          {this.state.annotations.map((item) => {
            return (
              <div className="content" key={item.uid}>
                <SidebarItem
                  onClickAction="scroll"
                  data={item}
                  onDeleteAnnotation={() => {
                    if (!confirm("Are you sure you want to delete this annotation?")) {
                      return;
                    }
                    deleteAnnotation({ uid: item.uid }).then(() => {
                      this.setState({
                        annotations: this.state.annotations.filter((x) => x.id !== item.id),
                      });
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
        <div id="sidebar-dragger" style={{ cursor: 'ew-resize', width: '10px', backgroundColor: 'transparent', position: 'absolute', right: 0, top: 0, height: '100%' }} />
      </div>
    );
  }
}
