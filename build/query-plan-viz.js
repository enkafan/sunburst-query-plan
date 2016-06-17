var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var QueryPlanViz;
(function (QueryPlanViz) {
    var Options = (function () {
        function Options() {
        }
        return Options;
    }());
    var Visualizer = (function () {
        /**
         * @param options Options for the chart
         */
        function Visualizer(options) {
            var _this = this;
            // Mapping of step names to colors. 
            this.colors = {
                "operation": "#5687d1",
                "data": "#7b615c",
                "join": "#de783b",
                "language": "#6ab975",
                "other": "#a173d1",
                "end": "#0c0909"
            };
            // fudge it so at least everything has can make an appearance. this is straight garbage honestly
            // but if we don't do it query plans where a join happens where it is 99.9% vs 1% the .1% just doesn't show
            // looks ok until you zoom in on the tiny items and then they don't "resize" to be relative to one another
            this.totalSize = 0;
            this.arc = d3.svg.arc()
                .startAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, _this.x(d.x))); })
                .endAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, _this.x(d.x + d.dx))); })
                .innerRadius(function (d) { return Math.max(0, _this.y(d.y)); })
                .outerRadius(function (d) { return Math.max(0, _this.y(d.y + d.dy)); });
            this.partition = d3.layout.partition()
                .value(function (d) { return Math.max(_this.totalSize / 360, d.size); });
            this.nodeFactory = new QueryNodeFactory();
            this.width = options.width != undefined ? options.width : 500;
            this.height = options.height != undefined ? options.height : 500;
            this.radius = (Math.min(this.width, this.height) / 2) - 10;
            this.x = d3.scale.linear()
                .range([0, 2 * Math.PI]);
            this.y = d3.scale.sqrt()
                .range([0, this.radius]);
            var chartSelector = options.chartSelector != undefined ? options.chartSelector : ".query-plan-visualization .chart";
            var tableSelector = options.tableSelector != undefined ? options.tableSelector : ".query-plan-visualization .table";
            this.vis = d3.select(chartSelector)
                .append("svg")
                .attr("width", this.width)
                .attr("height", this.height)
                .append("g")
                .attr("id", "container")
                .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")");
            this.rect = this.vis.selectAll("rect");
            this.table = d3.select(tableSelector).append("table");
            this.tbody = this.table.append("tbody");
        }
        /**
         * Renders a chart using data from an xml file
         *
         * @param filePath
         */
        Visualizer.prototype.renderXml = function (filePath) {
            var _this = this;
            d3.xml(filePath, "application/xml", function (error, data) {
                if (error)
                    throw error;
                _this.renderData(data);
            });
        };
        Visualizer.prototype.renderData = function (data) {
            var _this = this;
            var queries = data.querySelectorAll("StmtSimple");
            var root = new RootNode();
            for (var _i = 0, queries_1 = queries; _i < queries_1.length; _i++) {
                var query = queries_1[_i];
                root.children.push(this.buildQuery(query));
            }
            this.totalSize = 0;
            this.addSizeToTotal(root);
            this.rect = this.rect
                .data(this.partition.nodes(root))
                .enter().append("path")
                .attr("display", function (d) {
                if (!d.depth)
                    return "none";
                return d.operationType === "end" ? "none" : null;
            })
                .attr("d", this.arc)
                .attr("fill", function (d) { return _this.colors[d.operationType]; })
                .on("click", function (d) { return _this.click(d); })
                .on("mouseover", function (d) { return _this.mouseover(d); });
            d3.select("#container").on("mouseleave", function (d) { return _this.mouseleave(d); });
        };
        Visualizer.prototype.buildQuery = function (q) {
            var queryPlan = q.querySelector(":scope > QueryPlan");
            var item = new QueryOperationNode(q);
            item.size = q.attributes["StatementSubTreeCost"].value;
            item.details.concat([
                { name: "StatementSubTreeCost", value: q.attributes["StatementSubTreeCost"].value },
                { name: "StatementEstRows", value: q.attributes["StatementEstRows"].value },
                { name: "DegreeOfParallelism", value: queryPlan.attributes["DegreeOfParallelism"].value },
                { name: "CachedPlanSize", value: queryPlan.attributes["CachedPlanSize"].value + " KB" }
            ]);
            var childOps = q.querySelectorAll(":scope > * > RelOp");
            this.addRelOps(item, childOps);
            return item;
        };
        Visualizer.prototype.setDescription = function (item, node) {
            item.title = node.attributes["PhysicalOp"].value + " (" + node.attributes["LogicalOp"].value + ")";
            var objectNode = node.querySelector(":scope > * > Object");
            if (objectNode != undefined)
                item.description = this
                    .getNameFromAttributeList(objectNode, ["Schema", "Table", "Index", "Column", "Alias"]);
        };
        Visualizer.prototype.getNameFromAttributeList = function (node, attributeList) {
            var name = "";
            var first = true;
            for (var _i = 0, attributeList_1 = attributeList; _i < attributeList_1.length; _i++) {
                var attributeName = attributeList_1[_i];
                var attribute = node.attributes[attributeName];
                if (attribute != undefined) {
                    if (first === false)
                        name += ".";
                    else
                        first = false;
                    name += attribute.value;
                }
            }
            return name;
        };
        Visualizer.prototype.addSizeToTotal = function (d) {
            if (d.size != undefined) {
                this.totalSize += Number(d.size);
            }
            if (d.children == undefined)
                return;
            var i;
            for (i = 0; i < d.children.length; i++) {
                this.addSizeToTotal(d.children[i]);
            }
        };
        Visualizer.prototype.addRelOps = function (parent, relOps) {
            for (var _i = 0, relOps_1 = relOps; _i < relOps_1.length; _i++) {
                var op = relOps_1[_i];
                var item = this.nodeFactory.getQueryNode(op);
                var children = op.querySelectorAll(":scope > * > RelOp");
                if (children.length > 0) {
                    this.addRelOps(item, children);
                }
                parent.children.push(item);
            }
        };
        Visualizer.prototype.click = function (node) {
            var _this = this;
            console.log("click");
            this.vis
                .transition()
                .duration(750)
                .tween("scale", function () {
                var xd = d3.interpolate(_this.x.domain(), [node.x, node.x + node.dx]), yd = d3.interpolate(_this.y.domain(), [node.y, 1]), yr = d3.interpolate(_this.y.range(), [node.y ? 60 : 0, _this.radius]);
                return function (t) {
                    _this.x.domain(xd(t));
                    _this.y.domain(yd(t)).range(yr(t));
                };
            })
                .selectAll("path")
                .attrTween("d", function (d) { return function () { return _this.arc(d); }; });
        };
        Visualizer.prototype.mouseover = function (d) {
            // const parents = this.getAncestors(d);
            var children = this.getDescendents(d);
            // Fade all the segments.
            d3.selectAll("path")
                .style("opacity", 0.6)
                .style("border-color", "#fff");
            // Then highlight only those that are an ancestor of the current segment.
            this.vis.selectAll("path")
                .filter(function (node) { return (children.indexOf(node) >= 0); })
                .style("opacity", 1);
            this.vis.selectAll("path")
                .filter(function (node) { return (node === d); })
                .style("border-color", "#ccc");
            d3.selectAll(".query-plan-details-title").html(d.title != undefined ? d.title : "&nbsp;");
            d3.selectAll(".query-plan-details-description").html(d.description != undefined ? d.description : "&nbsp;");
            var details = d.details;
            if (details == undefined)
                details = d.parent.details;
            var row = this.tbody.selectAll("tr");
            row.remove();
            row.data(details)
                .enter()
                .append("tr");
            row.append("td").text(function (r) { return r.name; });
            row.append("td").text(function (r) { return r.value; });
        };
        // Restore everything to full opacity when moving off the visualization.
        Visualizer.prototype.mouseleave = function (d) {
            d3.selectAll("path")
                .style("opacity", 1);
        };
        // Given a node in a partition layout, return an array of all of its ancestor
        // nodes, highest first, but excluding the root.
        Visualizer.prototype.getAncestors = function (node) {
            var path = new Array();
            var current = node;
            while (current.parent) {
                path.unshift(current);
                current = current.parent;
            }
            return path;
        };
        Visualizer.prototype.getDescendents = function (node) {
            var path = [node];
            if (node.children == undefined)
                return path;
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var child = _a[_i];
                path.push.apply(path, this.getDescendents(child));
            }
            return path;
        };
        return Visualizer;
    }());
    QueryPlanViz.Visualizer = Visualizer;
    var Details = (function () {
        function Details() {
        }
        return Details;
    }());
    var QueryNode = (function () {
        function QueryNode() {
            this.children = new Array();
            this.details = new Array();
        }
        return QueryNode;
    }());
    var OperationNode = (function (_super) {
        __extends(OperationNode, _super);
        function OperationNode(node) {
            _super.call(this);
            this.name = name;
            this.logicalOperation = node.attributes["LogicalOp"].value;
            this.physicalOperation = node.attributes["PhysicalOp"].value;
            this.operationType = this.getOperationType(this.logicalOperation);
            this.details = new Array();
            this.children.push(new CostQueryNode("EstimateCPU", Number(node.attributes["EstimateCPU"].value)));
            this.children.push(new CostQueryNode("EstimatedIO", Number(node.attributes["EstimateIO"].value)));
        }
        OperationNode.prototype.getOperationType = function (logicalOp) {
            switch (logicalOp) {
                case "Clustered Index Scan":
                case "Clustered Index Seek":
                case "Index Seek":
                case "Index Scan":
                case "Table Scan":
                    return "data";
                case "Cross Join":
                case "Inner Join":
                case "Left Anti Semi Join":
                case "Left Outer Join":
                case "Left Semi Join":
                case "Right Anti Semi Join":
                case "Right Outer Join":
                case "Right Semi Join":
                case "Merge":
                    return "join";
                default:
                    return "operation";
            }
        };
        return OperationNode;
    }(QueryNode));
    var RootNode = (function (_super) {
        __extends(RootNode, _super);
        function RootNode() {
            _super.call(this);
            this.name = "Queries";
            this.size = 0;
        }
        return RootNode;
    }(QueryNode));
    var QueryOperationNode = (function (_super) {
        __extends(QueryOperationNode, _super);
        function QueryOperationNode(node) {
            _super.call(this);
            this.statementType = node.attributes["StatementType"].value;
            this.operationType = "language";
        }
        return QueryOperationNode;
    }(QueryNode));
    var CostQueryNode = (function (_super) {
        __extends(CostQueryNode, _super);
        function CostQueryNode(name, size) {
            _super.call(this);
            this.name = name;
            this.size = size;
        }
        return CostQueryNode;
    }(QueryNode));
    var QueryNodeFactory = (function () {
        function QueryNodeFactory() {
        }
        QueryNodeFactory.prototype.getQueryNode = function (node) {
            return new OperationNode(node);
        };
        return QueryNodeFactory;
    }());
})(QueryPlanViz || (QueryPlanViz = {}));
//# sourceMappingURL=query-plan-viz.js.map