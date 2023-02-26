import React from "react";
import classnames from "classnames";
import "./AnnotationsExplorer.less";
import { findAnnotations } from "../../api/annotations";

export default class AnnotationsExplorer extends React.Component {
  state = {
    firstLevelData: [],
    firstLevelSelection: "",
    secondLevelData: [],
    secondLevelSelection: "",
    thirdLevelData: [],
    thirdLevelSelection: "",
  };

  async getFirstLevelData() {
    const result = await findAnnotations({
      selectors: {},
      groupBy: "host",
    });

    this.setState({
      firstLevelData: result.data.list,
      firstLevelSelection: "",
      secondLevelData: [],
      secondLevelSelection: "",
      thirdLevelData: [],
      thirdLevelSelection: "",
    });
  }

  async getSecondLevelData() {
    const result = await findAnnotations({
      selectors: { host: this.state.firstLevelSelection },
      groupBy: "title",
    });

    this.setState({
      secondLevelData: result.data.list,
      secondLevelSelection: "",
      thirdLevelData: [],
      thirdLevelSelection: "",
    });
  }

  async getThirdLevelData() {
    const result = await findAnnotations({
      selectors: {
        host: this.state.firstLevelSelection,
        title: this.state.secondLevelSelection,
      },
    });

    this.setState({
      thirdLevelData: result.data.list,
      thirdLevelSelection: "",
    });
  }

  async setFirstLevelSelection(selection) {
    this.setState(
      {
        firstLevelSelection: selection,
      },
      () => this.getSecondLevelData()
    );
  }

  async setSecondLevelSelection(selection) {
    this.setState(
      {
        secondLevelSelection: selection,
      },
      () => this.getThirdLevelData()
    );
  }

  async componentDidMount() {
    await this.getFirstLevelData();
  }

  render() {
    return (
      <div className={"annotations-explorer-root"}>
        <div className="columns">
          <div
            className="column"
            style={{ flex: "0 0 12vw", maxWidth: "12vw" }}
          >
            {this.state.firstLevelData.map((item) => {
              return (
                <div
                  onClick={() => this.setFirstLevelSelection(item.host)}
                  className={classnames({
                    "list-item": true,
                    active: this.state.firstLevelSelection === item.host,
                  })}
                >
                  <div
                    className={classnames({
                      content: true,
                    })}
                  >
                    <span className="text">
                      <img
                        className="favicon"
                        src={`https://s2.googleusercontent.com/s2/favicons?domain_url=http://${item.host}`}
                        alt=""
                      />
                      {item.host || "(N/A)"}
                    </span>
                    <span className="count">{item.count}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="column"
            style={{ flex: "0 0 20vw", maxWidth: "20vw" }}
          >
            {this.state.secondLevelData.map((item) => {
              return (
                <div
                  onClick={() => this.setSecondLevelSelection(item.title)}
                  className={classnames({
                    "list-item": true,
                    active: this.state.secondLevelSelection === item.title,
                  })}
                >
                  <div
                    className={classnames({
                      content: true,
                    })}
                  >
                    <span className="text">{item.title || "(N/A)"}</span>
                    <span className="count">{item.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="column" style={{ flex: "1 1 auto" }}>
            {this.state.thirdLevelData.map((item) => {
              return (
                <div className="list-item">
                  <div className="content">
                    <ThirdLevelItem data={item} />
                  </div>
                </div>
              );
            })}
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
          onClick={() =>
            window.open(
              `${this.props.data.url}#notelix:scroll:annotation_id:${this.props.data.id}`
            )
          }
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
          </div>
        </div>
      </div>
    );
  }
}
