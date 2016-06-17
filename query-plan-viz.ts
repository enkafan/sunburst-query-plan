module QueryPlanViz {

    class Options {
        height: number;
        width: number;
        chartSelector: string;
        tableSelector: string;
    }

    export class Visualizer {
        // Mapping of step names to colors. 
        private colors: { [id: string]: string; } = {
            "operation": "#5687d1",
            "data": "#7b615c",
            "join": "#de783b",
            "language": "#6ab975",
            "other": "#a173d1",
            "end": "#0c0909"
        };

        private width: number;
        private height: number;
        private radius: number;

        private x: d3.scale.Linear<number, number>;
        private y: d3.scale.Linear<number, number>;

        // fudge it so at least everything has can make an appearance. this is straight garbage honestly
        // but if we don't do it query plans where a join happens where it is 99.9% vs 1% the .1% just doesn't show
        // looks ok until you zoom in on the tiny items and then they don't "resize" to be relative to one another
        private totalSize = 0;

        private vis: d3.Selection<any>;
        private rect: d3.Selection<any>;
        private table: d3.Selection<any>;
        private tbody: d3.Selection<any>;

        private arc = d3.svg.arc<QueryNode>()
            .startAngle(d => Math.max(0, Math.min(2 * Math.PI, this.x(d.x))))
            .endAngle(d => Math.max(0, Math.min(2 * Math.PI, this.x(d.x + d.dx))))
            .innerRadius(d => Math.max(0, this.y(d.y)))
            .outerRadius(d => Math.max(0, this.y(d.y + d.dy)));

        private partition = d3.layout.partition<QueryNode>()
            .value(d => Math.max(this.totalSize / 360, d.size));

        private nodeFactory =  new QueryNodeFactory();

        /**
         * @param options Options for the chart
         */
        constructor(options: Options) {
            this.width = options.width != undefined ? options.width : 500;
            this.height = options.height != undefined ? options.height : 500;
            this.radius = (Math.min(this.width, this.height) / 2) - 10;

            this.x = d3.scale.linear()
                .range([0, 2 * Math.PI]);
            this.y = d3.scale.sqrt()
                .range([0, this.radius]);

            const chartSelector = options.chartSelector != undefined ? options.chartSelector : ".query-plan-visualization .chart";
            const tableSelector = options.tableSelector != undefined ? options.tableSelector : ".query-plan-visualization .table";

            this.vis = d3.select(chartSelector)
                .append("svg")
                .attr("width", this.width)
                .attr("height", this.height)
                .append("g")
                .attr("id", "container")
                .attr("transform", `translate(${this.width / 2},${this.height / 2})`);

            this.rect = this.vis.selectAll("rect");
            this.table = d3.select(tableSelector).append("table");
            this.tbody = this.table.append("tbody");
        }


        /**
         * Renders a chart using data from an xml file
         * 
         * @param filePath
         */
        renderXml(filePath: string) {d3.xml(filePath, "application/xml", (error, data) => {
                if (error) throw error;
                this.renderData(data);
            });
        }

        private renderData(data: any) {
            const queries = data.querySelectorAll("StmtSimple");
            const root = new RootNode();
            
            for (let query of queries) {
                root.children.push(this.buildQuery(query));
            }

            this.totalSize = 0;
            this.addSizeToTotal(root);

            this.rect = this.rect
                .data<QueryNode>(this.partition.nodes(root))
                .enter().append("path")
                .attr("display", d => {
                    if (!d.depth) return "none";
                    return d.operationType === "end" ? "none" : null;
                })
                .attr("d", this.arc)
                .attr("fill", d => this.colors[d.operationType])
                .on("click", d => this.click(d))
                .on("mouseover", d => this.mouseover(d));

            d3.select("#container").on("mouseleave", d => this.mouseleave(d));
        }

        private buildQuery(q: any) {
            const queryPlan = q.querySelector(":scope > QueryPlan");
            const item = new QueryOperationNode(q);
            item.size = q.attributes["StatementSubTreeCost"].value;
            item.details.concat([
                { name: "StatementSubTreeCost", value: q.attributes["StatementSubTreeCost"].value },
                { name: "StatementEstRows", value: q.attributes["StatementEstRows"].value },
                { name: "DegreeOfParallelism", value: queryPlan.attributes["DegreeOfParallelism"].value },
                { name: "CachedPlanSize", value: queryPlan.attributes["CachedPlanSize"].value + " KB" }
            ]);

            const childOps = q.querySelectorAll(":scope > * > RelOp");

            this.addRelOps(item, childOps);

            return item;
        }

        private setDescription(item: QueryNode, node: any) {
            item.title = node.attributes["PhysicalOp"].value + " (" + node.attributes["LogicalOp"].value + ")";
            const objectNode = node.querySelector(":scope > * > Object");
            if (objectNode != undefined)
                item.description = this
                    .getNameFromAttributeList(objectNode, ["Schema", "Table", "Index", "Column", "Alias"]);
        }

        private getNameFromAttributeList(node: any, attributeList: string[]) {
            let name = "";
            let first = true;

            for (let attributeName of attributeList) {
                const attribute = node.attributes[attributeName];
                if (attribute != undefined) {
                    if (first === false)
                        name += ".";
                    else
                        first = false;

                    name += attribute.value;
                }
            }

            return name;
        }

        private addSizeToTotal(d: QueryNode) {
            if (d.size != undefined) {
                this.totalSize += Number(d.size);
            }
            if (d.children == undefined)
                return;

            let i: number;
            for (i = 0; i < d.children.length; i++) {
                this.addSizeToTotal(d.children[i]);
            }
        }

        private addRelOps(parent: QueryNode, relOps:any) {
            
            for (let op of relOps) {

                const item = this.nodeFactory.getQueryNode(op);
                                
                const children = op.querySelectorAll(":scope > * > RelOp");
                if (children.length > 0) {
                    this.addRelOps(item, children);
                }

                parent.children.push(item);
            }
        }


        click(node: QueryNode) {
            console.log("click");
            this.vis
                .transition()
                .duration(750)
                .tween("scale",
                () => {
                    var xd = d3.interpolate(this.x.domain(), [node.x, node.x + node.dx]),
                        yd = d3.interpolate(this.y.domain(), [node.y, 1]),
                        yr = d3.interpolate(this.y.range(), [node.y ? 60 : 0, this.radius]);
                    return t => {
                        this.x.domain(xd(t));
                        this.y.domain(yd(t)).range(yr(t));
                    };
                })
                .selectAll("path")
                .attrTween("d", d => () => this.arc(d));
        }

        mouseover(d: QueryNode) {
            // const parents = this.getAncestors(d);
            var children = this.getDescendents(d);

            // Fade all the segments.
            d3.selectAll("path")
                .style("opacity", 0.6)
                .style("border-color", "#fff");

            // Then highlight only those that are an ancestor of the current segment.
            this.vis.selectAll("path")
                .filter(node => (children.indexOf(node) >= 0))
                .style("opacity", 1);

            this.vis.selectAll("path")
                .filter(node => (node === d))
                .style("border-color", "#ccc");

            d3.selectAll(".query-plan-details-title").html(d.title != undefined ? d.title : "&nbsp;");
            d3.selectAll(".query-plan-details-description").html(d.description != undefined ? d.description : "&nbsp;");

            let details = d.details;
            if (details == undefined)
                details = d.parent.details;

            const row = this.tbody.selectAll("tr");
            row.remove();
            row.data(details)
                .enter()
                .append("tr");
            row.append("td").text(r => r.name);
            row.append("td").text(r => r.value);

        }

        // Restore everything to full opacity when moving off the visualization.
        mouseleave(d: QueryNode) {
            d3.selectAll("path")
                .style("opacity", 1);
        }

        // Given a node in a partition layout, return an array of all of its ancestor
        // nodes, highest first, but excluding the root.
        getAncestors(node: QueryNode): QueryNode[] {
            const path = new Array<QueryNode>();
            let current = node;
            while (current.parent) {
                path.unshift(current);
                current = current.parent;
            }
            return path;
        }

        getDescendents(node: QueryNode): QueryNode[] {
            const path = [node];
            if (node.children == undefined)
                return path;

            for (let child of node.children) {
                path.push.apply(path, this.getDescendents(child));
            }

            return path;
        }
    }

    class Details {
        name: string;
        value: string;
    }

    class QueryNode implements d3.layout.partition.Node {       
        size: number;
        name: string;
        depth: number;
        x: number;
        y: number;
        dx: number;
        dy: number;
        operationType: string;
        title: string;
        description: string;
        details: Details[];
        parent: QueryNode;
        children: QueryNode[];

        constructor(){
            this.children = new Array<QueryNode>();
            this.details = new Array<Details>();
        }
    }

    class OperationNode extends QueryNode{
        logicalOperation: string;
        physicalOperation: string;

        constructor(node: any){
            super();
            this.name = name;
            this.logicalOperation = node.attributes["LogicalOp"].value;
            this.physicalOperation = node.attributes["PhysicalOp"].value;
            this.operationType = this.getOperationType(this.logicalOperation);
            this.details = new Array<Details>();

            this.children.push(new CostQueryNode("EstimateCPU", Number(node.attributes["EstimateCPU"].value)));
            this.children.push(new CostQueryNode("EstimatedIO", Number(node.attributes["EstimateIO"].value)));
        }

        getOperationType(logicalOp: string) {
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
        }
    }

    class RootNode extends QueryNode{
        constructor(){
            super();
            this.name = "Queries";
            this.size = 0;
        }
    }

    class QueryOperationNode extends QueryNode{
        statementType:string;
        
        constructor(node: any){
            super();
            this.statementType = node.attributes["StatementType"].value;
            this.operationType = "language";
        }
    }

    class CostQueryNode extends QueryNode{
        constructor(name:string, size:number) {
            super();
            this.name = name;
            this.size = size;            
        }
    }

    class QueryNodeFactory{
        getQueryNode(node: any){
            return new OperationNode(node);
        }
    }
    
}