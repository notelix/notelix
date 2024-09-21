import React from "react";
import "./AnnotationsExplorer.less";

export default class AnnotationItem extends React.Component {
    render() {
      const { onClickAction } = this.props; // Get the onClickAction prop

      const handleClick = () => {
        if (onClickAction === "scroll") {
          const annotationElement = document.getElementsByTagName("web-marker-highlight");
          for (let i = 0; i < annotationElement.length; i++) {
            if (annotationElement[i].getAttribute("highlight-id") === this.props.data.uid) {
              annotationElement[i].scrollIntoView({ behavior: "smooth" });
            }
          }
        } else if (onClickAction === "open") {
          window.open(
            `${this.props.data.url}#notelix:scroll:annotation_id:${this.props.data.id}`
          );
        }
      };

      return (
        <div className="third-level-item">
          <div
            className="hit"
            onClick={handleClick} // Use the handleClick function
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
