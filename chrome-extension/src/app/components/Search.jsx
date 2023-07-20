import React from "react";
import debounce from "lodash/debounce";
import {deleteAnnotation, findAnnotations, search,} from "../../api/annotations";
import "./Search.less";

export default class Search extends React.Component {
    state = {q: "", data: null};

    debouncedSearch = debounce(() => {
        search(this.state.q).then((resp) => this.setState({data: resp.data}));
    }, 500);

    onSearchResultClick = (hit) => {
        window.open(`${hit.url}#notelix:scroll:annotation_id:${hit.id}`);
    };

    render() {
        return (
            <div className="search-root">
        <span className="logo">
          <img src="./public/logo.png" alt=""/>
        </span>

                <input
                    placeholder="Search..."
                    type="text"
                    value={this.state.q}
                    onChange={(e) => {
                        this.setState({q: e.target.value});
                        this.debouncedSearch();
                    }}
                />

                {!!(this.state.data && this.state.q) && (
                    <div className="search-result-root">
                        <div className="content">
                            {!this.state.data.results.hits.length && (
                                <div>No results found.</div>
                            )}
                            {this.state.data.results.hits.map((hit) => {
                                return (
                                    <div
                                        className="hit"
                                        onClick={() => this.onSearchResultClick(hit)}
                                    >
                                        {hit.textBefore}
                                        <div
                                            className="text"
                                            style={{textDecorationColor: hit.color}}
                                            dangerouslySetInnerHTML={{
                                                __html: hit._formatted.text,
                                            }}
                                        />
                                        {hit.textAfter}
                                        {!!hit.notes && (
                                            <div className="notes-wrapper">
                                                <div
                                                    dangerouslySetInnerHTML={{
                                                        __html: hit._formatted.notes,
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <div className="url">
                      <span
                          className="color-dot"
                          style={{background: hit.color}}
                      />
                                            <span
                                                className="title"
                                                dangerouslySetInnerHTML={{
                                                    __html: hit._formatted.title,
                                                }}
                                            />
                                            {hit.url}
                                        </div>
                                        <a
                                            className={"delete-button"}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                if (
                                                    !confirm(
                                                        "Are you sure you want to delete this annotation?"
                                                    )
                                                ) {
                                                    return;
                                                }

                                                findAnnotations({
                                                    groupBy: "",
                                                    selectors: {id: hit.id},
                                                }).then((result) => {
                                                    const annotationToDelete = result.data.list[0];
                                                    deleteAnnotation(annotationToDelete).then(() => {
                                                        this.setState({
                                                            data: {
                                                                ...this.state.data,
                                                                results: {
                                                                    ...this.state.data.results,
                                                                    hits: this.state.data.results.hits.filter(
                                                                        (x) => x.id !== hit.id
                                                                    ),
                                                                },
                                                            },
                                                        });
                                                    });
                                                });
                                            }}
                                        >
                                            Delete
                                        </a>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
