import React from "react";
import "../../sidebar.less";


const TrashIcon = (props) => (
  <svg
    height='15px'
    width='15px'
    fill="#ffa8a8"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    version="1.1"
    x="0px"
    y="0px"
    viewBox="0 0 32 32"
    style={{ enableBackground: 'new 0 0 32 32' }}
    xmlSpace="preserve"
    {...props}
  >
    <g>
      <path d="M24.496,32.019H7.504C6.124,32.019,5,30.896,5,29.515L5,7c0-0.552,0.448-1,1-1s1,0.448,1,1l0,22.515c0,0.278,0.226,0.504,0.504,0.504h16.992c0.278,0,0.504-0.226,0.504-0.504V7c0-0.552,0.447-1,1-1s1,0.448,1,1v22.515C27,30.896,25.877,32.019,24.496,32.019z"></path>
      <path d="M29,8H3C2.448,8,2,7.552,2,7s0.448-1,1-1h26c0.553,0,1,0.448,1,1S29.553,8,29,8z"></path>
      <path d="M20,7.302c-0.553,0-1-0.448-1-1V5.019c0-1.654-1.346-3-3-3s-3,1.346-3,3v1.283c0,0.552-0.448,1-1,1s-1-0.448-1-1V5.019c0-2.757,2.243-5,5-5s5,2.243,5,5v1.283C21,6.854,20.553,7.302,20,7.302z"></path>
      <path d="M11,26c-0.552,0-1-0.447-1-1V13c0-0.552,0.448-1,1-1s1,0.448,1,1v12C12,25.553,11.552,26,11,26z"></path>
      <path d="M21,26c-0.553,0-1-0.447-1-1V13c0-0.552,0.447-1,1-1s1,0.448,1,1v12C22,25.553,21.553,26,21,26z"></path>
      <path d="M16,27c-0.552,0-1-0.447-1-1V12c0-0.552,0.448-1,1-1s1,0.448,1,1v14C17,26.553,16.552,27,16,27z"></path>
    </g>
  </svg>
);
export default class SidebarItem extends React.Component {
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
          <div id="sidebar-item-main" onClick={handleClick}>
            <div id="sidebar-item-annotation" style={{ borderLeftColor: this.props.data.data.color }}>
              <p>{this.props.data.data.text}</p>
              {!!this.props.data.data.notes && (
                <div id="sidebar-item-notes">
                  <p>{this.props.data.data.notes}</p>
                </div>
              )}
            </div>
            <div id="sidebar-item-delete">
              <a
                style={{ float: "right", marginTop: "10px"}}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  this.props.onDeleteAnnotation();
                }}
              >
                <TrashIcon />
              </a>
            </div>
        </div>
        );
        // <div className="sidebar-annotate-item">
        //   <div
        //     className="hit"
        //     onClick={handleClick} // Use the handleClick function
        //   >
        //     {/* {this.props.data.data.textBefore} */}
        //     <span
        //       className="text"
        //       style={{ textDecorationColor: this.props.data.data.color }}
        //     >
        //       {this.props.data.data.text}
        //     </span>
        //     {/* {this.props.data.data.textAfter} */}

        //     {!!this.props.data.data.notes && (
        //       <div className="notes-wrapper">
        //         <div>{this.props.data.data.notes}</div>
        //       </div>
        //     )}
        //     <div className="url">
        //       <span
        //         className="color-dot"
        //         style={{ background: this.props.data.data.color }}
        //       />
        //       {/* {this.props.data.url} */}
        //       <a
        //         style={{ float: "right" }}
        //         onClick={(e) => {
        //           e.stopPropagation();
        //           e.preventDefault();
        //           this.props.onDeleteAnnotation();
        //         }}
        //       >
        //         Delete
        //       </a>
        //     </div>
        //   </div>
        // </div>
      // );
    }
  }
